/*
Copyright 2023-2025 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type IWidgetApiRequest } from "matrix-widget-api";
import { logger } from "matrix-js-sdk/lib/logger";
import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  firstValueFrom,
  fromEvent,
  map,
  merge,
  Observable,
  of,
  Subject,
  switchMap,
  withLatestFrom,
} from "rxjs";

import { type MediaDevices, type MediaDevice } from "../state/MediaDevices";
import { ElementWidgetActions, widget } from "../widget";
import { type ObservableScope } from "./ObservableScope";
import { type Behavior, constant } from "./Behavior";

interface MuteStateData {
  enabled$: Observable<boolean>;
  syncing$: Observable<boolean>;
  set: ((enabled: boolean) => void) | null;
  toggle: (() => void) | null;
}

export type Handler = (desired: boolean) => Promise<boolean>;
const defaultHandler: Handler = async (desired) => Promise.resolve(desired);

/**
 * Internal class - exported only for testing purposes.
 * Do not use directly outside of tests.
 */
export class MuteState<Label, Selected> {
  private readonly handler$ = new BehaviorSubject(defaultHandler);

  public setHandler(handler: Handler): void {
    if (this.handler$.value !== defaultHandler)
      throw new Error("Multiple mute state handlers are not supported");
    this.handler$.next(handler);
  }

  public unsetHandler(): void {
    this.handler$.next(defaultHandler);
  }

  private readonly canControlDevices$ = combineLatest([
    this.device.available$,
    this.forceMute$,
  ]).pipe(
    map(([available, forceMute]) => {
      return !forceMute && available.size > 0;
    }),
  );

  private readonly data$ = this.scope.behavior<MuteStateData>(
    this.canControlDevices$.pipe(
      distinctUntilChanged(),
      map((canControlDevices) => {
        logger.info(
          `MuteState: canControlDevices: ${canControlDevices}, enabled by default: ${this.enabledByDefault}`,
        );
        if (!canControlDevices) {
          logger.info(
            `MuteState: devices connected: ${canControlDevices}, disabling`,
          );
          // We need to sync the mute state with the handler
          // to ensure nothing is beeing published.
          this.handler$.value(false).catch((err) => {
            logger.error("MuteState-disable: handler error", err);
          });
          return {
            enabled$: of(false),
            syncing$: of(false),
            set: null,
            toggle: null,
          };
        }

        // Assume the default value only once devices are actually connected
        let enabled = this.enabledByDefault;
        const set$ = new Subject<boolean>();
        const toggle$ = new Subject<void>();
        const syncing$ = new BehaviorSubject(false);
        const desired$ = merge(set$, toggle$.pipe(map(() => !enabled)));
        const enabled$ = new Observable<boolean>((subscriber) => {
          subscriber.next(enabled);
          let latestDesired = this.enabledByDefault;

          const sync = async (): Promise<void> => {
            if (enabled === latestDesired) {
              syncing$.next(false);
            } else {
              const previouslyEnabled = enabled;
              syncing$.next(true);
              enabled = await firstValueFrom(
                this.handler$.pipe(
                  switchMap(async (handler) => handler(latestDesired)),
                ),
              );
              if (enabled === previouslyEnabled) {
                syncing$.next(false);
              } else {
                subscriber.next(enabled);
                syncing$.next(true);
                sync().catch((err) => {
                  // TODO: better error handling
                  logger.error("MuteState: handler error", err);
                });
              }
            }
          };

          const s = desired$.subscribe((desired) => {
            latestDesired = desired;
            if (syncing$.value === false) {
              syncing$.next(true);
              sync().catch((err) => {
                // TODO: better error handling
                logger.error("MuteState: handler error", err);
              });
            }
          });
          return (): void => {
            s.unsubscribe();
            syncing$.complete();
          };
        });

        return {
          set: (enabled: boolean): void => set$.next(enabled),
          toggle: (): void => {
            if (syncing$.value) return;
            toggle$.next();
          },
          enabled$,
          syncing$,
        };
      }),
    ),
  );

  public readonly enabled$: Behavior<boolean> = this.scope.behavior(
    this.data$.pipe(switchMap(({ enabled$ }) => enabled$)),
  );

  public readonly setEnabled$: Behavior<((enabled: boolean) => void) | null> =
    this.scope.behavior(this.data$.pipe(map(({ set }) => set)));

  public readonly toggle$: Behavior<(() => void) | null> = this.scope.behavior(
    this.data$.pipe(map(({ toggle }) => toggle)),
  );

  public readonly syncing$: Behavior<boolean> = this.scope.behavior(
    this.data$.pipe(switchMap(({ syncing$ }) => syncing$)),
  );

  public constructor(
    private readonly scope: ObservableScope,
    private readonly device: MediaDevice<Label, Selected>,
    private readonly enabledByDefault: boolean,
    /**
     * An optional observable which, when it emits `true`, will force the mute.
     * Used for video to stop camera when earpiece mode is on.
     * @private
     */
    private readonly forceMute$: Observable<boolean>,
  ) {}
}

export class MuteStates {
  /**
   *  True if the selected audio output device is an earpiece.
   *  Used to force-disable video when on earpiece.
   */
  private readonly isEarpiece$ = combineLatest([
    this.mediaDevices.audioOutput.available$,
    this.mediaDevices.audioOutput.selected$,
  ]).pipe(
    map(([available, selected]) => {
      if (!selected?.id) return false;
      const device = available.get(selected.id);
      logger.info(`MuteStates: selected audio output device:`, device);
      return device?.type === "earpiece";
    }),
  );

  public readonly audio = new MuteState(
    this.scope,
    this.mediaDevices.audioInput,
    this.initialMuteState.audioEnabled,
    constant(false),
  );
  public readonly video = new MuteState(
    this.scope,
    this.mediaDevices.videoInput,
    this.initialMuteState.videoEnabled,
    this.isEarpiece$,
  );

  public constructor(
    private readonly scope: ObservableScope,
    private readonly mediaDevices: MediaDevices,
    private readonly initialMuteState: {
      audioEnabled: boolean;
      videoEnabled: boolean;
    },
  ) {
    if (widget !== null) {
      // Sync our mute states with the hosting client
      const widgetApiState$ = combineLatest(
        [this.audio.enabled$, this.video.enabled$],
        (audio, video) => ({ audio_enabled: audio, video_enabled: video }),
      );
      widgetApiState$.pipe(this.scope.bind()).subscribe((state) => {
        widget!.api.transport
          .send(ElementWidgetActions.DeviceMute, state)
          .catch((e) =>
            logger.warn("Could not send DeviceMute action to widget", e),
          );
      });

      // Also sync the hosting client's mute states back with ours
      const muteActions$ = fromEvent(
        widget.lazyActions,
        ElementWidgetActions.DeviceMute,
      ) as Observable<CustomEvent<IWidgetApiRequest>>;
      muteActions$
        .pipe(
          withLatestFrom(
            widgetApiState$,
            this.audio.setEnabled$,
            this.video.setEnabled$,
          ),
          this.scope.bind(),
        )
        .subscribe(([ev, state, setAudioEnabled, setVideoEnabled]) => {
          // First copy the current state into our new state
          const newState = { ...state };
          // Update new state if there are any requested changes from the widget
          // action in `ev.detail.data`.
          if (
            ev.detail.data.audio_enabled != null &&
            typeof ev.detail.data.audio_enabled === "boolean" &&
            setAudioEnabled !== null
          ) {
            newState.audio_enabled = ev.detail.data.audio_enabled;
            setAudioEnabled(newState.audio_enabled);
          }
          if (
            ev.detail.data.video_enabled != null &&
            typeof ev.detail.data.video_enabled === "boolean" &&
            setVideoEnabled !== null
          ) {
            newState.video_enabled = ev.detail.data.video_enabled;
            setVideoEnabled(newState.video_enabled);
          }
          widget!.api.transport.reply(ev.detail, newState);
        });
    }
  }
}

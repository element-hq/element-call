/*
Copyright 2023-2025 New Vector Ltd.

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
import { Config } from "../config/Config";
import { getUrlParams } from "../UrlParams";
import { type ObservableScope } from "./ObservableScope";
import { type Behavior } from "./Behavior";

interface MuteStateData {
  enabled$: Observable<boolean>;
  set: ((enabled: boolean) => void) | null;
  toggle: (() => void) | null;
}

export type Handler = (desired: boolean) => Promise<boolean>;
const defaultHandler: Handler = async (desired) => Promise.resolve(desired);

class MuteState<Label, Selected> {
  private readonly enabledByDefault$ =
    this.enabledByConfig && !getUrlParams().skipLobby
      ? this.joined$.pipe(map((isJoined) => !isJoined))
      : of(false);

  private readonly handler$ = new BehaviorSubject(defaultHandler);
  public setHandler(handler: Handler): void {
    if (this.handler$.value !== defaultHandler)
      throw new Error("Multiple mute state handlers are not supported");
    this.handler$.next(handler);
  }
  public unsetHandler(): void {
    this.handler$.next(defaultHandler);
  }

  private readonly data$ = this.scope.behavior<MuteStateData>(
    this.device.available$.pipe(
      map((available) => available.size > 0),
      distinctUntilChanged(),
      withLatestFrom(
        this.enabledByDefault$,
        (devicesConnected, enabledByDefault) => {
          if (!devicesConnected)
            return { enabled$: of(false), set: null, toggle: null };

          // Assume the default value only once devices are actually connected
          let enabled = enabledByDefault;
          const set$ = new Subject<boolean>();
          const toggle$ = new Subject<void>();
          const desired$ = merge(set$, toggle$.pipe(map(() => !enabled)));
          const enabled$ = new Observable<boolean>((subscriber) => {
            subscriber.next(enabled);
            let latestDesired = enabledByDefault;
            let syncing = false;

            const sync = async (): Promise<void> => {
              if (enabled === latestDesired) syncing = false;
              else {
                const previouslyEnabled = enabled;
                enabled = await firstValueFrom(
                  this.handler$.pipe(
                    switchMap(async (handler) => handler(latestDesired)),
                  ),
                );
                if (enabled === previouslyEnabled) {
                  syncing = false;
                } else {
                  subscriber.next(enabled);
                  syncing = true;
                  sync().catch((err) => {
                    // TODO: better error handling
                    logger.error("MuteState: handler error", err);
                  });
                }
              }
            };

            const s = desired$.subscribe((desired) => {
              latestDesired = desired;
              if (syncing === false) {
                syncing = true;
                sync().catch((err) => {
                  // TODO: better error handling
                  logger.error("MuteState: handler error", err);
                });
              }
            });
            return (): void => s.unsubscribe();
          });

          return {
            set: (enabled: boolean): void => set$.next(enabled),
            toggle: (): void => toggle$.next(),
            enabled$,
          };
        },
      ),
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

  public constructor(
    private readonly scope: ObservableScope,
    private readonly device: MediaDevice<Label, Selected>,
    private readonly joined$: Observable<boolean>,
    private readonly enabledByConfig: boolean,
  ) {}
}

export class MuteStates {
  public readonly audio = new MuteState(
    this.scope,
    this.mediaDevices.audioInput,
    this.joined$,
    Config.get().media_devices.enable_audio,
  );
  public readonly video = new MuteState(
    this.scope,
    this.mediaDevices.videoInput,
    this.joined$,
    Config.get().media_devices.enable_video,
  );

  public constructor(
    private readonly scope: ObservableScope,
    private readonly mediaDevices: MediaDevices,
    private readonly joined$: Observable<boolean>,
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

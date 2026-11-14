/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  map,
  type Observable,
  of,
  switchMap,
} from "rxjs";
import { supportsAudioOutputSelection } from "livekit-client";
import { type LocalVideoMediaTrack } from "@element-hq/matrixrtc-sdk";
import { supportsModernBackgroundProcessors } from "@livekit/track-processors";
import { logger } from "matrix-js-sdk/lib/logger";

import {
  parseEffect,
  serializeEffect,
  shippedBackgrounds,
} from "../tracks/backgroundEffectCatalog";
import {
  type AddedBackground,
  addedBackgrounds,
  maxAddedBackgrounds,
  type UnusableReason,
  UnusableImage,
} from "../tracks/backgroundImages";
import { type BackgroundEffectsState } from "../state/BackgroundEffects";
import { type MenuOptions } from "./MediaMuteAndSwitchButton";
import { type MediaDevices } from "../state/MediaDevices";
import { backgroundEffect as backgroundEffectSetting } from "../settings/settings";
import { type Behavior, constant } from "../state/Behavior";
import type { ObservableScope } from "../state/ObservableScope";
import { type MuteStates } from "../state/MuteStates";
import { createStaticViewModel, type ViewModel } from "../state/ViewModel";
import { type BackgroundEffectGridItem } from "./BackgroundEffectGrid";

export interface BackgroundImageRefusal {
  reason: UnusableReason | "not-kept";
}

/**
 * A mute button with a menu to pick the device, shared by the microphone and
 * the camera. Fields that belong to the other device are left empty.
 */
export interface MediaMenuSnapshot {
  enabled: boolean;
  busy: boolean;
  /** Also controls if the button is disabled */
  toggle: (() => void) | undefined;
  /** No options leave out the menu, which is then a plain mute button. */
  options: MenuOptions[];
  selected: string | undefined;
  select: ((id: string) => void) | undefined;

  /** Output (speaker) devices. Microphone only. */
  outputOptions: MenuOptions[];
  selectedOutput: string | undefined;
  /** Undefined where the platform can't route audio to a chosen device. */
  selectOutput: ((id: string) => void) | undefined;

  /** The selected background effect, as its option id. Camera only. */
  backgroundEffect: string | undefined;
  /** Every effect on offer, in the order they are shown. */
  backgroundEffects: BackgroundEffectGridItem[];
  /** What the user is told about effects here, if anything. */
  backgroundEffectNotice: "unavailable" | "slow" | undefined;
  /** Whether the first effect chosen is still being prepared. */
  backgroundEffectSettling: boolean;
  /** Why the last file offered couldn't be kept, if it couldn't. */
  backgroundImageRefusal: BackgroundImageRefusal | undefined;
  /** Undefined where background effects can't be chosen. */
  selectBackgroundEffect: ((id: string) => void) | undefined;
  /** Undefined where no background can be added. */
  addBackgroundImage: ((file: File) => void) | undefined;
  /** Removes an added background by its option id, unless it is the selected one. */
  removeBackgroundEffect: ((id: string) => void) | undefined;
  /** The camera to preview, with the selected effect; null while it is off. */
  cameraTrack: LocalVideoMediaTrack | null;
}

export type MediaMenuViewModel = ViewModel<MediaMenuSnapshot>;

const noBackgroundEffects = {
  backgroundEffect: undefined,
  backgroundEffects: [],
  backgroundEffectNotice: undefined,
  backgroundEffectSettling: false,
  backgroundImageRefusal: undefined,
  selectBackgroundEffect: undefined,
  addBackgroundImage: undefined,
  removeBackgroundEffect: undefined,
  cameraTrack: null,
} satisfies Partial<MediaMenuSnapshot>;

function options$(
  disableSwitcher$: Behavior<boolean>,
  available$: Behavior<Map<string, MenuOptions["label"]>>,
): Observable<MenuOptions[]> {
  return disableSwitcher$.pipe(
    switchMap((disable) =>
      disable
        ? constant([] as MenuOptions[])
        : available$.pipe(
            map((available) =>
              [...available.entries()].map(([id, label]) => ({ id, label })),
            ),
          ),
    ),
  );
}

/**
 * The microphone's mute button and menu, with the speaker choice.
 *
 * @param disableSwitcher$ - True to leave out the menu.
 */
export function createAudioMenuViewModel(
  scope: ObservableScope,
  muteStates: MuteStates,
  mediaDevices: MediaDevices,
  disableSwitcher$: Behavior<boolean>,
): MediaMenuViewModel {
  const { audio } = muteStates;
  return {
    ...createStaticViewModel(noBackgroundEffects),
    enabled$: audio.enabled$,
    busy$: audio.syncing$,
    toggle$: scope.behavior(audio.toggle$.pipe(map((t) => t ?? undefined))),
    options$: scope.behavior(
      options$(disableSwitcher$, mediaDevices.audioInput.available$),
    ),
    selected$: scope.behavior(
      mediaDevices.audioInput.selected$.pipe(map((s) => s?.id)),
    ),
    select$: constant(mediaDevices.audioInput.select),
    outputOptions$: scope.behavior(
      options$(disableSwitcher$, mediaDevices.audioOutput.available$),
    ),
    selectedOutput$: scope.behavior(
      mediaDevices.audioOutput.selected$.pipe(map((s) => s?.id)),
    ),
    // Withheld where the platform can't route audio to a chosen device, which
    // disables the speaker section.
    selectOutput$: constant(
      supportsAudioOutputSelection()
        ? mediaDevices.audioOutput.select
        : undefined,
    ),
  };
}

/**
 * The camera's mute button and menu, with the background effects and a
 * preview of the camera.
 *
 * @param disableSwitcher$ - True to leave out the menu.
 * @param backgroundEffectsState$ - The background pipeline's state: whether
 *   effects run here, and the wait for the first.
 * @param camera$ - The camera as the pipeline has it, for the preview.
 */
export function createCameraMenuViewModel(
  scope: ObservableScope,
  muteStates: MuteStates,
  mediaDevices: MediaDevices,
  disableSwitcher$: Behavior<boolean>,
  backgroundEffectsState$: Observable<BackgroundEffectsState>,
  camera$: Observable<LocalVideoMediaTrack | null | undefined>,
): MediaMenuViewModel {
  const { video } = muteStates;
  // Also false once the pipeline has failed to build this session.
  const supported$ = backgroundEffectsState$.pipe(
    map(({ supported }) => supported === true),
    distinctUntilChanged(),
  );
  const slow = !supportsModernBackgroundProcessors();
  const offered$ = combineLatest([disableSwitcher$, supported$]).pipe(
    map(([switcherDisabled, supported]) => !switcherDisabled && supported),
  );
  // A new object for each refusal, so the same one twice is shown twice.
  const refusal$ = new BehaviorSubject<BackgroundImageRefusal | undefined>(
    undefined,
  );
  return {
    ...createStaticViewModel({
      outputOptions: [],
      selectedOutput: undefined,
      selectOutput: undefined,
    }),
    enabled$: video.enabled$,
    busy$: video.syncing$,
    toggle$: scope.behavior(video.toggle$.pipe(map((t) => t ?? undefined))),
    options$: scope.behavior(
      options$(disableSwitcher$, mediaDevices.videoInput.available$),
    ),
    selected$: scope.behavior(
      mediaDevices.videoInput.selected$.pipe(map((s) => s?.id)),
    ),
    select$: constant(mediaDevices.videoInput.select),
    backgroundEffect$: scope.behavior(
      combineLatest([backgroundEffectSetting.value$, supported$]).pipe(
        map(([raw, supported]) =>
          supported ? serializeEffect(parseEffect(raw)) : "none",
        ),
      ),
    ),
    selectBackgroundEffect$: scope.behavior(
      offered$.pipe(
        map((offered) =>
          offered
            ? (id: string): void =>
                backgroundEffectSetting.setValue(
                  serializeEffect(parseEffect(id)),
                )
            : undefined,
        ),
      ),
    ),
    backgroundEffects$: scope.behavior(
      addedBackgrounds.added$.pipe(
        map((added) => backgroundEffectChoices(added ?? [])),
      ),
    ),
    backgroundEffectNotice$: scope.behavior(
      offered$.pipe(
        map((offered) =>
          !offered ? "unavailable" : slow ? "slow" : undefined,
        ),
      ),
    ),
    backgroundEffectSettling$: scope.behavior(
      backgroundEffectsState$.pipe(
        map(({ wait }) => wait !== undefined),
        distinctUntilChanged(),
      ),
      false,
    ),
    // Kept and offered, not put on: that waits for the user to choose it.
    addBackgroundImage$: scope.behavior(
      combineLatest([offered$, addedBackgrounds.added$]).pipe(
        map(([offered, added]) =>
          offered && (added?.length ?? 0) < maxAddedBackgrounds
            ? (file: File): void => {
                refusal$.next(undefined);
                addedBackgrounds.add(file).catch((e) => {
                  logger.warn("Could not keep that background", e);
                  refusal$.next({
                    reason: e instanceof UnusableImage ? e.reason : "not-kept",
                  });
                });
              }
            : undefined,
        ),
      ),
    ),
    backgroundImageRefusal$: refusal$,
    // None while muted: the call mutes its track rather than releasing it.
    cameraTrack$: scope.behavior(
      camera$.pipe(
        switchMap((camera) =>
          camera
            ? camera.muted$.pipe(map((muted) => (muted ? null : camera)))
            : of(null),
        ),
      ),
      null,
    ),
    removeBackgroundEffect$: scope.behavior(
      offered$.pipe(
        map((offered) =>
          offered
            ? (optionId: string): void => {
                const effect = parseEffect(optionId);
                if (effect.kind !== "added") return;
                // The selected effect can't be removed: that would leave no
                // effect selected.
                if (backgroundEffectSetting.getValue() === optionId) return;
                addedBackgrounds
                  .remove(effect.id)
                  .catch((e) =>
                    logger.warn("Could not remove that background", e),
                  );
              }
            : undefined,
        ),
      ),
    ),
  };
}

function backgroundEffectChoices(
  added: AddedBackground[],
): BackgroundEffectGridItem[] {
  return [
    { id: serializeEffect({ kind: "none" }), kind: "none", removable: false },
    { id: serializeEffect({ kind: "blur" }), kind: "blur", removable: false },
    ...shippedBackgrounds.map((background) => ({
      id: serializeEffect({ kind: "shipped", id: background.id }),
      kind: "image" as const,
      imageUrl: background.imagePath,
      removable: false,
    })),
    ...added.map((background) => ({
      id: serializeEffect({ kind: "added", id: background.id }),
      kind: "image" as const,
      imageUrl: background.url,
      removable: true,
    })),
  ];
}

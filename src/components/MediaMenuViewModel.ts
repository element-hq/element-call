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
import { type MenuOptions } from "./DeviceMenu";
import { type MediaDevices } from "../state/MediaDevices";
import { backgroundEffect as backgroundEffectSetting } from "../settings/settings";
import { type Behavior, constant } from "../state/Behavior";
import type { ObservableScope } from "../state/ObservableScope";
import { type MuteStates } from "../state/MuteStates";
import { type ViewModel } from "../state/ViewModel";
import { type BackgroundEffectGridItem } from "./BackgroundEffectGrid";

export interface BackgroundImageRefusal {
  reason: UnusableReason | "not-kept";
}

/**
 * A mute button with a menu to pick the device, shared by the microphone and
 * the camera.
 */
export interface DeviceMenuSnapshot {
  /** Whether the device is on. (muted/unmuted state) */
  enabled: boolean;
  busy: boolean;
  /** Turns the device on or off. Undefined while it can't be toggled. (disable interaction state) */
  toggle: (() => void) | undefined;
  options: MenuOptions[];
  selected: string | undefined;
  select: ((id: string) => void) | undefined;
}

/** The output (speaker) devices in the microphone's menu. */
export interface OutputMenuSnapshot {
  options: MenuOptions[];
  selected: string | undefined;
  /** Undefined if the output device is not configurable. */
  select: ((id: string) => void) | undefined;
}

/** The background effects in the camera's menu. */
export interface BackgroundEffectsMenuSnapshot {
  /** The selected effect, as its option id. */
  selected: string;
  /** Every effect on offer, in the order they are shown. */
  available: BackgroundEffectGridItem[];
  /** What the user is told about effects here, if anything. */
  notice: "unavailable" | "slow" | undefined;
  /** Whether the first effect chosen is still being prepared. */
  settling: boolean;
  /** Why the last file offered couldn't be kept, if it couldn't. */
  imageRefusal: BackgroundImageRefusal | undefined;
  /** Undefined where background effects can't be chosen. */
  select: ((id: string) => void) | undefined;
  /** Undefined where no background can be added. */
  addImage: ((file: File) => void) | undefined;
  /** Removes an added background by its option id, unless it is the selected one. */
  remove: ((id: string) => void) | undefined;
}

export type AudioMenuViewModel = ViewModel<DeviceMenuSnapshot> & {
  readonly kind: "audio";
  readonly output: ViewModel<OutputMenuSnapshot>;
};

export type CameraMenuViewModel = ViewModel<DeviceMenuSnapshot> & {
  readonly kind: "video";
  readonly backgroundEffects: ViewModel<BackgroundEffectsMenuSnapshot>;
  /** The camera to preview, with the selected effect; null while it is off. */
  readonly cameraTrack$: Behavior<LocalVideoMediaTrack | null>;
};

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
): AudioMenuViewModel {
  const { audio } = muteStates;
  return {
    kind: "audio",
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
    output: {
      options$: scope.behavior(
        options$(disableSwitcher$, mediaDevices.audioOutput.available$),
      ),
      selected$: scope.behavior(
        mediaDevices.audioOutput.selected$.pipe(map((s) => s?.id)),
      ),
      select$: constant(
        supportsAudioOutputSelection()
          ? mediaDevices.audioOutput.select
          : undefined,
      ),
    },
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
): CameraMenuViewModel {
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
    kind: "video",
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
    backgroundEffects: {
      selected$: scope.behavior(
        combineLatest([backgroundEffectSetting.value$, supported$]).pipe(
          map(([raw, supported]) =>
            supported ? serializeEffect(parseEffect(raw)) : "none",
          ),
        ),
      ),
      available$: scope.behavior(
        addedBackgrounds.added$.pipe(
          map((added) => backgroundEffectChoices(added ?? [])),
        ),
      ),
      notice$: scope.behavior(
        offered$.pipe(
          map((offered) =>
            !offered ? "unavailable" : slow ? "slow" : undefined,
          ),
        ),
      ),
      settling$: scope.behavior(
        backgroundEffectsState$.pipe(
          map(({ wait }) => wait !== undefined),
          distinctUntilChanged(),
        ),
        false,
      ),
      imageRefusal$: refusal$,
      select$: scope.behavior(
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
      // Kept and offered, not put on: that waits for the user to choose it.
      addImage$: scope.behavior(
        combineLatest([offered$, addedBackgrounds.added$]).pipe(
          map(([offered, added]) =>
            offered && (added?.length ?? 0) < maxAddedBackgrounds
              ? (file: File): void => {
                  refusal$.next(undefined);
                  addedBackgrounds.add(file).catch((e) => {
                    logger.warn("Could not keep that background", e);
                    refusal$.next({
                      reason:
                        e instanceof UnusableImage ? e.reason : "not-kept",
                    });
                  });
                }
              : undefined,
          ),
        ),
      ),
      remove$: scope.behavior(
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
    },
    // Muting stops the camera, and so its light.
    // The track outlives the mute, so its mute state is checked.
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

/*
Copyright 2024-2025 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type ProcessorWrapper,
  type BackgroundOptions,
  supportsBackgroundProcessors,
} from "@livekit/track-processors";
import { createContext, type FC, type JSX, use, useEffect } from "react";
import { type LocalVideoTrack } from "livekit-client";
import { logger } from "matrix-js-sdk/lib/logger";
import {
  combineLatest,
  distinctUntilChanged,
  EMPTY,
  map,
  Observable,
  switchMap,
} from "rxjs";

import { backgroundEffect as backgroundEffectSetting } from "../settings/settings";
import { BackgroundEffectTransformer } from "./BackgroundEffectTransformer";
import { type SyncedCameraTrack } from "./cameraTrack";
import { OneStepPipeline } from "./OneStepPipeline";
import { addedBackgrounds } from "./backgroundImages";
import { type Behavior } from "../state/Behavior";
import { type ObservableScope } from "../state/ObservableScope";
import {
  type BackgroundEffects,
  createBackgroundEffects,
} from "../state/BackgroundEffects";
import { useBehavior } from "../useBehavior";

//TODO-MULTI-SFU: This is not yet fully there.
// it is a combination of exposing observable and react hooks.
// preferably we should not make this a context anymore and instead just a vm?

export type BackgroundEffectsState = {
  supported: boolean | undefined;
  processor: undefined | ProcessorWrapper<BackgroundOptions>;
  /** From the first effect chosen until a frame carrying it is drawn. */
  settling?: boolean;
  /** The camera this provider's pipeline is synced to. */
  cameraTrack?: SyncedCameraTrack;
};

const BackgroundEffectsContext = createContext<BackgroundEffects | undefined>(
  undefined,
);

export function useBackgroundEffects(): BackgroundEffectsState {
  return useBehavior(useBackgroundEffectsState$());
}

export function useBackgroundEffectsState$(): Behavior<BackgroundEffectsState> {
  const effects = use(BackgroundEffectsContext);
  if (effects === undefined)
    throw new Error(
      "useBackgroundEffects must be used within a BackgroundEffectsProvider",
    );
  return effects.state$;
}

/**
 * Attaches or detaches the processor so that the track matches the desired
 * state, without throwing.
 */
export function applyProcessor(
  videoTrack: LocalVideoTrack,
  processor: ProcessorWrapper<BackgroundOptions> | undefined,
): void {
  if (processor && !videoTrack.getProcessor()) {
    // A MediaStreamTrackProcessor cannot be constructed on an ended track
    // (e.g. the camera was stopped while the processor was being applied),
    // and setProcessor rejects with a TypeError. The track is going away
    // anyway, so there is nothing to attach to.
    if (videoTrack.mediaStreamTrack.readyState === "ended") {
      logger.debug("Not attaching video processor to an ended track");
      return;
    }
    const track = videoTrack.mediaStreamTrack;
    videoTrack.setProcessor(processor).catch((e) => {
      if (track.readyState === "ended")
        logger.debug("Video processor not attached: the track ended first");
      else logger.warn("Failed to attach video processor", e);
    });
  }
  if (!processor && videoTrack.getProcessor()) {
    videoTrack.stopProcessor().catch((e) => {
      logger.warn("Failed to stop video processor", e);
    });
  }
}

/**
 * Updates your video tracks to always use the given processor.
 */
export const syncBackgroundEffects = (
  scope: ObservableScope,
  videoTrack$: Behavior<LocalVideoTrack | null>,
  backgroundEffectsState$: Behavior<BackgroundEffectsState>,
): void => {
  combineLatest([videoTrack$, backgroundEffectsState$])
    .pipe(scope.bind())
    .subscribe(([videoTrack, backgroundEffectsState]) => {
      if (!backgroundEffectsState) return;
      if (!videoTrack) return;
      applyProcessor(videoTrack, backgroundEffectsState.processor);
    });
  // Keyed on the camera alone: reporting again for every change of state would
  // blank the preview each time.
  combineLatest([
    videoTrack$,
    backgroundEffectsState$.pipe(
      map(({ cameraTrack }) => cameraTrack),
      distinctUntilChanged(),
    ),
  ])
    .pipe(
      switchMap(([track, cameraTrack]) =>
        track === null || cameraTrack === undefined
          ? EMPTY
          : new Observable<never>(() => cameraTrack.report(track)),
      ),
      scope.bind(),
    )
    .subscribe();
};

export const useSyncBackgroundEffects = (
  videoTrack: LocalVideoTrack | null,
): void => {
  const { processor, cameraTrack } = useBackgroundEffects();
  useEffect(() => {
    if (!videoTrack) return;
    applyProcessor(videoTrack, processor);
  }, [processor, videoTrack]);
  useEffect(() => {
    if (videoTrack && cameraTrack) return cameraTrack.report(videoTrack);
  }, [cameraTrack, videoTrack]);
};

/** The app's one pipeline, shared by every camera track it opens. */
export function createAppBackgroundEffects(
  scope: ObservableScope,
): BackgroundEffects {
  const transformer = new BackgroundEffectTransformer({
    backgroundDisabled: true,
  });
  return createBackgroundEffects(scope, {
    supported: supportsBackgroundProcessors(),
    effect$: backgroundEffectSetting.value$,
    setEffect: backgroundEffectSetting.setValue,
    added$: addedBackgrounds.added$,
    pipeline: new OneStepPipeline(transformer, "background-effect"),
    transformer,
  });
}

interface Props {
  effects: BackgroundEffects;
  children: JSX.Element;
}

export const BackgroundEffectsProvider: FC<Props> = ({ effects, children }) => (
  <BackgroundEffectsContext value={effects}>
    {children}
  </BackgroundEffectsContext>
);

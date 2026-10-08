/*
Copyright 2024-2025 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type ProcessorWrapper,
  type BackgroundOptions,
} from "@livekit/track-processors";
import {
  createContext,
  type FC,
  type JSX,
  use,
  useEffect,
  useState,
} from "react";
import { type LocalVideoTrack } from "livekit-client";
import { logger } from "matrix-js-sdk/lib/logger";
import { combineLatest } from "rxjs";

import { backgroundBlur as backgroundBlurSettings } from "../settings/settings";
import { BackgroundEffectTransformer } from "./BackgroundEffectTransformer";
import { OneStepPipeline } from "./OneStepPipeline";
import { supportsBackgroundProcessors } from "./backgroundProcessing";
import { type Behavior } from "../state/Behavior";
import { ObservableScope } from "../state/ObservableScope";
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
};

export const useSyncBackgroundEffects = (
  videoTrack: LocalVideoTrack | null,
): void => {
  const { processor } = useBackgroundEffects();
  useEffect(() => {
    if (!videoTrack) return;
    applyProcessor(videoTrack, processor);
  }, [processor, videoTrack]);
};

interface Props {
  children: JSX.Element;
}

export const BackgroundEffectsProvider: FC<Props> = ({ children }) => {
  const [effects, setEffects] = useState<BackgroundEffects | null>(null);
  useEffect(() => {
    const scope = new ObservableScope();
    setEffects(
      createBackgroundEffects(scope, {
        supported: supportsBackgroundProcessors(),
        blur$: backgroundBlurSettings.value$,
        pipeline: new OneStepPipeline(
          new BackgroundEffectTransformer({ backgroundDisabled: true }),
          "background-effect",
        ),
      }),
    );
    return (): void => scope.end();
  }, []);

  if (effects === null) return null;
  return (
    <BackgroundEffectsContext value={effects}>
      {children}
    </BackgroundEffectsContext>
  );
};

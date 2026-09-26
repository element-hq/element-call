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
import { supportsBackgroundProcessors } from "./backgroundProcessing";
import { type Behavior } from "../state/Behavior";
import { ObservableScope } from "../state/ObservableScope";
import { BackgroundEffects } from "../state/BackgroundEffects";
import { useBehavior } from "../useBehavior";

//TODO-MULTI-SFU: This is not yet fully there.
// it is a combination of exposing observable and react hooks.
// preferably we should not make this a context anymore and instead just a vm?

export type ProcessorState = {
  supported: boolean | undefined;
  processor: undefined | ProcessorWrapper<BackgroundOptions>;
  /** From the first effect chosen until a frame carrying it is drawn. */
  settling?: boolean;
  /** The camera this provider's pipeline is synced to. */
  cameraTrack?: SyncedCameraTrack;
};

const ProcessorContext = createContext<BackgroundEffects | undefined>(
  undefined,
);

export function useTrackProcessor(): ProcessorState {
  return useBehavior(useTrackProcessorObservable$());
}

export function useTrackProcessorObservable$(): Behavior<ProcessorState> {
  const effects = use(ProcessorContext);
  if (effects === undefined)
    throw new Error(
      "useTrackProcessor must be used within a ProcessorProvider",
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
      // The pipeline builds one track at a time, so a track can end while its
      // build waits a turn. The camera's next track attaches it again.
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
export const trackProcessorSync = (
  scope: ObservableScope,
  videoTrack$: Behavior<LocalVideoTrack | null>,
  processor$: Behavior<ProcessorState>,
): void => {
  combineLatest([videoTrack$, processor$])
    .pipe(scope.bind())
    .subscribe(([videoTrack, processorState]) => {
      if (!processorState) return;
      if (!videoTrack) return;
      applyProcessor(videoTrack, processorState.processor);
    });
  // Keyed on the camera alone: reporting again for every change of state would
  // blank the preview each time.
  combineLatest([
    videoTrack$,
    processor$.pipe(
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

export const useTrackProcessorSync = (
  videoTrack: LocalVideoTrack | null,
): void => {
  const { processor, cameraTrack } = useTrackProcessor();
  useEffect(() => {
    if (!videoTrack) return;
    applyProcessor(videoTrack, processor);
  }, [processor, videoTrack]);
  useEffect(() => {
    if (videoTrack && cameraTrack) return cameraTrack.report(videoTrack);
  }, [cameraTrack, videoTrack]);
};

interface Props {
  children: JSX.Element;
}

export const ProcessorProvider: FC<Props> = ({ children }) => {
  const [effects, setEffects] = useState<BackgroundEffects | null>(null);
  useEffect(() => {
    const scope = new ObservableScope();
    const transformer = new BackgroundEffectTransformer({
      backgroundDisabled: true,
    });
    setEffects(
      new BackgroundEffects(scope, {
        supported: supportsBackgroundProcessors(),
        effect$: backgroundEffectSetting.value$,
        setEffect: backgroundEffectSetting.setValue,
        added$: addedBackgrounds.added$,
        pipeline: new OneStepPipeline(transformer, "background-effect"),
        transformer,
      }),
    );
    return (): void => scope.end();
  }, []);

  if (effects === null) return null;
  return <ProcessorContext value={effects}>{children}</ProcessorContext>;
};

/*
Copyright 2024-2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  ProcessorWrapper,
  supportsBackgroundProcessors as supportsBackgroundProcessorsLivekitSdk,
  type BackgroundOptions,
} from "@livekit/track-processors";
import {
  createContext,
  type FC,
  type JSX,
  use,
  useEffect,
  useMemo,
} from "react";
import { type LocalVideoTrack } from "livekit-client";
import { logger } from "matrix-js-sdk/lib/logger";
import { combineLatest, map, type Observable } from "rxjs";
import { useObservable } from "observable-hooks";

import {
  backgroundBlur as backgroundBlurSettings,
  useSetting,
} from "../settings/settings";
import { BlurBackgroundTransformer } from "./BlurBackgroundTransformer";
import { type Behavior } from "../state/Behavior";
import { type ObservableScope } from "../state/ObservableScope";
import { platform } from "../Platform";

//TODO-MULTI-SFU: This is not yet fully there.
// it is a combination of exposing observable and react hooks.
// preferably we should not make this a context anymore and instead just a vm?

export type ProcessorState = {
  supported: boolean | undefined;
  processor: undefined | ProcessorWrapper<BackgroundOptions>;
};

const ProcessorContext = createContext<ProcessorState | undefined>(undefined);

export function useTrackProcessor(): ProcessorState {
  const state = use(ProcessorContext);
  if (state === undefined)
    throw new Error(
      "useTrackProcessor must be used within a ProcessorProvider",
    );
  return state;
}

export function useTrackProcessorObservable$(): Observable<ProcessorState> {
  const state = use(ProcessorContext);
  if (state === undefined)
    throw new Error(
      "useTrackProcessor must be used within a ProcessorProvider",
    );
  const state$ = useObservable(
    (init$) => init$.pipe(map(([init]) => init)),
    [state],
  );

  return state$;
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
    videoTrack.setProcessor(processor).catch((e) => {
      logger.warn("Failed to attach video processor", e);
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
};

export const useTrackProcessorSync = (
  videoTrack: LocalVideoTrack | null,
): void => {
  const { processor } = useTrackProcessor();
  useEffect(() => {
    if (!videoTrack) return;
    applyProcessor(videoTrack, processor);
  }, [processor, videoTrack]);
};

interface Props {
  children: JSX.Element;
}

function supportsBackgroundProcessors(): boolean {
  return supportsBackgroundProcessorsLivekitSdk() && platform === "desktop";
}

export const ProcessorProvider: FC<Props> = ({ children }) => {
  // The setting the user wants to have
  const [blurActivated] = useSetting(backgroundBlurSettings);
  const supported = useMemo(() => supportsBackgroundProcessors(), []);
  const blur = useMemo(
    () =>
      new ProcessorWrapper(
        new BlurBackgroundTransformer({ blurRadius: 15 }),
        "background-blur",
      ),
    [],
  );

  // This is the actual state exposed through the context
  const processorState = useMemo(
    () => ({
      supported,
      processor: supported && blurActivated ? blur : undefined,
    }),
    [supported, blurActivated, blur],
  );

  return <ProcessorContext value={processorState}>{children}</ProcessorContext>;
};

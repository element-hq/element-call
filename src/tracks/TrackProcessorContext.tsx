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
import { createContext, type FC, type JSX, use, useMemo } from "react";
import { Track } from "livekit-client";
import { type VideoProcessor } from "@element-hq/matrixrtc-sdk";

import {
  backgroundBlur as backgroundBlurSettings,
  useSetting,
} from "../settings/settings";
import { BlurBackgroundTransformer } from "./BlurBackgroundTransformer";
import { type Behavior } from "../state/Behavior";
import { platform } from "../Platform";
import { useValueBehavior } from "../useValueBehavior";

//TODO-MULTI-SFU: This is not yet fully there.
// it is a combination of exposing observable and react hooks.
// preferably we should not make this a context anymore and instead just a vm?

export type ProcessorState = {
  supported: boolean | undefined;
  processor: undefined | VideoProcessor;
};

/**
 * This allows to use a LiveKit processor for the matrixRTCSDK (VideoProcessor).
 * They have slightly different apis so we need to convert them with this
 * function before we can use them in the matrixRTCSDK.
 */
export function fromLivekitProcessor(
  wrapper: ProcessorWrapper<BackgroundOptions>,
): VideoProcessor {
  const processedTrack = (): MediaStreamTrack => {
    if (wrapper.processedTrack === undefined)
      throw new Error(`Processor ${wrapper.name} produced no track`);
    return wrapper.processedTrack;
  };
  return {
    name: wrapper.name,
    init: async (track: MediaStreamTrack, element?: HTMLMediaElement) => {
      await wrapper.init({ kind: Track.Kind.Video, track, element });
      return processedTrack();
    },
    restart: async (track: MediaStreamTrack, element?: HTMLMediaElement) => {
      await wrapper.restart({ kind: Track.Kind.Video, track, element });
      return processedTrack();
    },
    destroy: async () => wrapper.destroy(),
  };
}

const ProcessorContext = createContext<ProcessorState | undefined>(undefined);

export function useTrackProcessor(): ProcessorState {
  const state = use(ProcessorContext);
  if (state === undefined)
    throw new Error(
      "useTrackProcessor must be used within a ProcessorProvider",
    );
  return state;
}

export function useTrackProcessorState$(): Behavior<ProcessorState> {
  return useValueBehavior(useTrackProcessor());
}

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
      fromLivekitProcessor(
        new ProcessorWrapper(
          new BlurBackgroundTransformer({ blurRadius: 15 }),
          "background-blur",
        ),
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

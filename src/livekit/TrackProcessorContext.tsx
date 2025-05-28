/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import {
  ProcessorWrapper,
  supportsBackgroundProcessors,
  type BackgroundOptions,
} from "@livekit/track-processors";
import { createContext, type FC, useContext, useEffect, useMemo } from "react";
import { type LocalVideoTrack } from "livekit-client";

import {
  backgroundBlur as backgroundBlurSettings,
  useSetting,
} from "../settings/settings";
import { BlurBackgroundTransformer } from "./BlurBackgroundTransformer";

type ProcessorState = {
  supported: boolean | undefined;
  processor: undefined | ProcessorWrapper<BackgroundOptions>;
};

const ProcessorContext = createContext<ProcessorState | undefined>(undefined);

export function useTrackProcessor(): ProcessorState {
  const state = useContext(ProcessorContext);
  if (state === undefined)
    throw new Error(
      "useTrackProcessor must be used within a ProcessorProvider",
    );
  return state;
}

export const useTrackProcessorSync = (
  videoTrack: LocalVideoTrack | null,
): void => {
  const { processor } = useTrackProcessor();
  useEffect(() => {
    if (!videoTrack) return;
    if (processor && !videoTrack.getProcessor()) {
      void videoTrack.setProcessor(processor);
    }
    if (!processor && videoTrack.getProcessor()) {
      void videoTrack.stopProcessor();
    }
  }, [processor, videoTrack]);
};

interface Props {
  children: JSX.Element;
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

  return (
    <ProcessorContext.Provider value={processorState}>
      {children}
    </ProcessorContext.Provider>
  );
};

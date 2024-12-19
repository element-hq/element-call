/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import {
  BackgroundBlur as backgroundBlur,
  type ProcessorWrapper,
  type BackgroundOptions,
} from "@livekit/track-processors";
import {
  createContext,
  type FC,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { logger } from "matrix-js-sdk/src/logger";
import { type LocalVideoTrack } from "livekit-client";

import {
  backgroundBlur as backgroundBlurSettings,
  useSetting,
} from "../settings/settings";

type ProcessorState = {
  supported: boolean | undefined;
  processor: undefined | ProcessorWrapper<BackgroundOptions>;
  /**
   * Call this method to try to initialize a processor.
   * This only needs to happen if supported is undefined.
   * If the backgroundBlur setting is set to true this does not need to be called
   * and the processorState.supported will update automatically to the correct value.
   */
  checkSupported: () => void;
};
const ProcessorContext = createContext<ProcessorState | undefined>(undefined);

export const useTrackProcessor = (): ProcessorState | undefined =>
  useContext(ProcessorContext);

export const useTrackProcessorSync = (
  videoTrack: LocalVideoTrack | null,
): void => {
  const { processor } = useTrackProcessor() || {};
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

  // If `ProcessorState.supported` is undefined the user can activate that we want
  // to have it at least checked (this is useful to show the settings menu properly)
  // We dont want to try initializing the blur if the user is not even looking at the setting
  const [shouldCheckSupport, setShouldCheckSupport] = useState(blurActivated);

  // Cache the processor so we only need to initialize it once.
  const blur = useRef<ProcessorWrapper<BackgroundOptions> | undefined>(
    undefined,
  );

  const checkSupported = useCallback(() => {
    setShouldCheckSupport(true);
  }, []);
  // This is the actual state exposed through the context
  const [processorState, setProcessorState] = useState<ProcessorState>(() => ({
    supported: false,
    processor: undefined,
    checkSupported,
  }));

  useEffect(() => {
    if (!shouldCheckSupport) return;
    try {
      if (!blur.current) {
        // TODO: move to our own local version of the transformer.
        // Currently this is broken: error when trying to pipe IndexSizeError: Failed to construct 'ImageData': The source width is zero or not a number.
        // blur.current = new ProcessorWrapper(
        //   new BlurBackgroundTransformer({}),
        //   "background-blur",
        // );

        // eslint-disable-next-line new-cap
        blur.current = backgroundBlur();
      }
      setProcessorState({
        checkSupported,
        supported: true,
        processor: blurActivated ? blur.current : undefined,
      });
    } catch (e) {
      setProcessorState({
        checkSupported,
        supported: false,
        processor: undefined,
      });
      logger.error("disable background blur", e);
    }
  }, [blurActivated, checkSupported, shouldCheckSupport]);

  return (
    <ProcessorContext.Provider value={processorState}>
      {children}
    </ProcessorContext.Provider>
  );
};

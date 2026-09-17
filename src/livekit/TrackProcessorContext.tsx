/*
Copyright 2024-2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  BackgroundProcessorWrapper,
  type ProcessorWrapper,
  supportsBackgroundProcessors as supportsBackgroundProcessorsLivekitSdk,
  type BackgroundOptions,
  type SwitchBackgroundProcessorOptions,
} from "@livekit/track-processors";
import {
  createContext,
  type FC,
  type JSX,
  use,
  useEffect,
  useMemo,
  useState,
} from "react";
import { type LocalVideoTrack } from "livekit-client";
import { logger } from "matrix-js-sdk/lib/logger";
import { combineLatest, map, type Observable } from "rxjs";
import { useObservable } from "observable-hooks";

import {
  backgroundEffect as backgroundEffectSetting,
  useSetting,
} from "../settings/settings";
import { BackgroundEffectTransformer } from "./BackgroundEffectTransformer";
import {
  blurRadius,
  imagePathFor,
  parseEffect,
  type BackgroundEffect,
} from "./backgroundEffects";
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

/** Translates a chosen effect into the pipeline's own vocabulary. */
function switchOptionsFor(
  effect: BackgroundEffect,
): SwitchBackgroundProcessorOptions {
  switch (effect.kind) {
    case "blur":
      return { mode: "background-blur", blurRadius };
    case "image": {
      const imagePath = imagePathFor(effect.id);
      return imagePath
        ? { mode: "virtual-background", imagePath }
        : { mode: "disabled" };
    }
    default:
      return { mode: "disabled" };
  }
}

export const ProcessorProvider: FC<Props> = ({ children }) => {
  const [effectRaw] = useSetting(backgroundEffectSetting);
  const supported = useMemo(() => supportsBackgroundProcessors(), []);

  // One pipeline for the lifetime of the app, so the pre-join preview and the
  // call share it and its priming frame is spent before anything is published
  // (D4).
  const pipeline = useMemo(
    () =>
      new BackgroundProcessorWrapper(
        new BackgroundEffectTransformer({ backgroundDisabled: true }),
        "background-effect",
      ),
    [],
  );

  // D5: nothing is attached until an effect is first chosen, so a user who
  // never chooses one pays neither the segmentation assets nor the time to
  // initialise them. Once attached it stays attached, including at no effect,
  // so a later change is a switch rather than a fresh attachment and spends no
  // further priming frame.
  const [attached, setAttached] = useState(
    () => parseEffect(effectRaw).kind !== "none",
  );
  useEffect(() => {
    if (parseEffect(effectRaw).kind !== "none") setAttached(true);
  }, [effectRaw]);

  // D2: switch the running pipeline in place rather than tearing it down, so
  // the previous effect stays in force until the new one is live.
  useEffect(() => {
    if (!supported || !attached) return;
    pipeline
      .switchTo(switchOptionsFor(parseEffect(effectRaw)))
      .catch((e) => logger.warn("Failed to switch background effect", e));
  }, [pipeline, supported, attached, effectRaw]);

  // This is the actual state exposed through the context
  const processorState = useMemo(
    () => ({
      supported,
      processor: supported && attached ? pipeline : undefined,
    }),
    [supported, attached, pipeline],
  );

  return <ProcessorContext value={processorState}>{children}</ProcessorContext>;
};

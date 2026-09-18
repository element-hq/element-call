/*
Copyright 2024-2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  BackgroundProcessorWrapper,
  type ProcessorWrapper,
  type BackgroundOptions,
  type SwitchBackgroundProcessorOptions,
} from "@livekit/track-processors";
import {
  createContext,
  type FC,
  type JSX,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
import { BackgroundImageStore } from "./backgroundImages";
import { supportsBackgroundProcessors } from "./backgroundProcessing";
import { type Behavior } from "../state/Behavior";
import { type ObservableScope } from "../state/ObservableScope";

//TODO-MULTI-SFU: This is not yet fully there.
// it is a combination of exposing observable and react hooks.
// preferably we should not make this a context anymore and instead just a vm?

/** A background the user added, as the view needs it: an id and a picture. */
export interface AddedBackgroundImage {
  id: string;
  /** Lives as long as the provider does. */
  url: string;
}

/**
 * What the publishing side needs: whether effects can run at all, and the
 * pipeline to attach. Deliberately not the backgrounds a user has added — the
 * publisher has no use for those, and every test that stands in for this would
 * have to carry them.
 */
export type ProcessorState = {
  supported: boolean | undefined;
  processor: undefined | ProcessorWrapper<BackgroundOptions>;
};

/** What the camera menu needs: the backgrounds this device keeps. */
export interface AddedBackgrounds {
  /** Oldest first. */
  added: AddedBackgroundImage[];
  /**
   * Keeps a file as a background. Rejects with `UnusableImage` for a file that
   * cannot be used, and `RangeError` once the device keeps as many as it will.
   */
  addBackground: (file: Blob) => Promise<string>;
  removeBackground: (id: string) => Promise<void>;
}

/** What the camera menu needs to know about the pipeline itself. */
export interface BackgroundProcessing {
  /**
   * Whether the pipeline is still being built. Only ever true once a session,
   * and only the first time an effect is chosen: building it fetches, compiles
   * and sets up the segmenter, which on some browsers holds the page still for
   * long enough that saying nothing looks like a crash.
   */
  settling: boolean;
}

const BackgroundProcessingContext = createContext<
  BackgroundProcessing | undefined
>(undefined);

export function useBackgroundProcessing(): BackgroundProcessing {
  const value = use(BackgroundProcessingContext);
  if (value === undefined)
    throw new Error(
      "useBackgroundProcessing must be used within a ProcessorProvider",
    );
  return value;
}

const AddedBackgroundsContext = createContext<AddedBackgrounds | undefined>(
  undefined,
);

export function useAddedBackgrounds(): AddedBackgrounds {
  const value = use(AddedBackgroundsContext);
  if (value === undefined)
    throw new Error(
      "useAddedBackgrounds must be used within a ProcessorProvider",
    );
  return value;
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

/** Translates a chosen effect into the pipeline's own vocabulary. */
function switchOptionsFor(
  effect: BackgroundEffect,
  added: AddedBackgroundImage[],
): SwitchBackgroundProcessorOptions {
  const withImage = (
    imagePath: string | undefined,
  ): SwitchBackgroundProcessorOptions =>
    // A background the device no longer has — removed, or storage cleared —
    // leaves the user with no effect rather than a pipeline drawing nothing.
    imagePath
      ? { mode: "virtual-background", imagePath }
      : { mode: "disabled" };

  switch (effect.kind) {
    case "blur":
      return { mode: "background-blur", blurRadius };
    case "shipped":
      return withImage(imagePathFor(effect.id));
    case "added":
      return withImage(added.find((a) => a.id === effect.id)?.url);
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
  const transformer = useMemo(
    () => new BackgroundEffectTransformer({ backgroundDisabled: true }),
    [],
  );
  const pipeline = useMemo(
    () => new BackgroundProcessorWrapper(transformer, "background-effect"),
    [transformer],
  );

  // The backgrounds this device keeps. Their URLs live as long as the provider
  // does, and are replaced wholesale whenever the set changes: an object URL
  // outlives the blob it names unless it is revoked, and the alternative is
  // tracking one lifetime per image.
  const store = useMemo(() => new BackgroundImageStore(), []);
  const [added, setAdded] = useState<AddedBackgroundImage[]>([]);
  const urls = useRef<string[]>([]);

  const reread = useCallback(async (): Promise<void> => {
    const kept = await store.list();
    urls.current.forEach((url) => URL.revokeObjectURL(url));
    urls.current = kept.map((background) =>
      URL.createObjectURL(background.image),
    );
    setAdded(kept.map(({ id }, i) => ({ id, url: urls.current[i] })));
  }, [store]);

  useEffect(() => {
    reread().catch((e) => logger.warn("Could not read added backgrounds", e));
    const opened = urls;
    return (): void => {
      opened.current.forEach((url) => URL.revokeObjectURL(url));
      opened.current = [];
    };
  }, [reread]);

  const addBackground = useCallback(
    async (file: Blob): Promise<string> => {
      const kept = await store.add(file);
      await reread();
      return kept.id;
    },
    [store, reread],
  );

  const removeBackground = useCallback(
    async (id: string): Promise<void> => {
      await store.remove(id);
      await reread();
    },
    [store, reread],
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
  const options = useMemo(
    () => switchOptionsFor(parseEffect(effectRaw), added),
    [effectRaw, added],
  );
  useEffect(() => {
    if (!supported || !attached) return;
    pipeline
      .switchTo(options)
      .catch((e) => logger.warn("Failed to switch background effect", e));
  }, [pipeline, supported, attached, options]);

  // The wait runs from deciding to attach until a frame actually comes out,
  // which is the only thing that marks the end of it: the promises resolve
  // while the segmenter is still being built, and on the slow path the page
  // then holds still for another twelve to fifteen seconds. Bounded by the
  // frame rather than by a timer, so it cannot end early and claim to be ready.
  const [producedAFrame, setProducedAFrame] = useState(false);
  useEffect(() => {
    transformer.onFirstFrame = (): void => setProducedAFrame(true);
    return (): void => {
      transformer.onFirstFrame = undefined;
    };
  }, [transformer]);
  const settling = supported === true && attached && !producedAFrame;

  // This is the actual state exposed through the context
  const processorState = useMemo(
    () => ({
      supported,
      processor: supported && attached ? pipeline : undefined,
    }),
    [supported, attached, pipeline],
  );

  const addedBackgrounds = useMemo(
    () => ({ added, addBackground, removeBackground }),
    [added, addBackground, removeBackground],
  );

  const backgroundProcessing = useMemo(() => ({ settling }), [settling]);

  return (
    <ProcessorContext value={processorState}>
      <AddedBackgroundsContext value={addedBackgrounds}>
        <BackgroundProcessingContext value={backgroundProcessing}>
          {children}
        </BackgroundProcessingContext>
      </AddedBackgroundsContext>
    </ProcessorContext>
  );
};

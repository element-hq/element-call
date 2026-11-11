/*
Copyright 2024-2025 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  BackgroundTransformer,
  VideoTransformer,
  type VideoTransformerInitOptions,
  type BackgroundOptions,
  type SegmenterOptions,
} from "@livekit/track-processors";
import { logger } from "matrix-js-sdk/lib/logger";
import { ImageSegmenter } from "@mediapipe/tasks-vision";

// Only the SIMD build of MediaPipe's runtime: every browser Element Call
// supports has WebAssembly SIMD. As files rather than data URLs, so that a
// host's bundler serves them as assets of its own, and a browser fetches them
// only when an effect is first switched on.
import wasmLoaderPath from "@mediapipe/tasks-vision/vision_wasm_internal.js?url&no-inline";
import wasmBinaryPath from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url&no-inline";
import modelAssetPath from "../mediapipe/imageSegmenter/selfie_segmenter.tflite?url&no-inline";

interface WasmFileset {
  /** The path to the Wasm loader script. */
  wasmLoaderPath: string;
  /** The path to the Wasm binary. */
  wasmBinaryPath: string;
}

const wasmFileset: WasmFileset = { wasmLoaderPath, wasmBinaryPath };

/**
 * Track processor that applies effects such as blurring to a user's background.
 *
 * This is just like LiveKit's prebuilt BackgroundTransformer except that it
 * loads the segmentation models from our own bundle rather than as an external
 * resource fetched from the public internet.
 */
export class BackgroundEffectTransformer extends BackgroundTransformer {
  /** Called once, when the first frame carrying an effect has been drawn. */
  public onFirstFrame: (() => void) | undefined;

  public override async transform(
    frame: VideoFrame,
    controller: TransformStreamDefaultController<VideoFrame>,
  ): Promise<void> {
    const priming = this.isFirstFrame;
    await super.transform(frame, controller);
    // Cleared only once a frame has been through the segmenter; a frame
    // passed through untouched leaves it set.
    if (priming && !this.isFirstFrame) this.onFirstFrame?.();
  }

  /**
   * As the library's, except that disabling also drops the blur radius. The
   * library skips a frame on `isDisabled ?? backgroundDisabled`, and
   * `isDisabled` is never undefined, so a disabled effect that keeps its
   * radius has every frame segmented and drawn for nothing. With neither a
   * radius nor a picture, frames are passed on untouched.
   * TODO: drop once fixed upstream in livekit/track-processors-js (still in 0.8.2).
   */
  public override async update(opts: BackgroundOptions): Promise<void> {
    await super.update(
      opts.backgroundDisabled ? { ...opts, blurRadius: undefined } : opts,
    );
  }

  public async init({
    outputCanvas,
    inputElement: inputVideo,
  }: VideoTransformerInitOptions): Promise<void> {
    // Call super.super.init() since we're totally replacing the init method of
    // BackgroundTransformer here, rather than extending it
    await VideoTransformer.prototype.init.call(this, {
      outputCanvas,
      inputElement: inputVideo,
    });

    this.imageSegmenter = await createSegmenter(
      this.canvas,
      this.options.segmenterOptions,
    );

    // BackgroundTransformer's own init applies these, and this one replaces it.
    if (this.options.imagePath) {
      await this.loadAndSetBackground(this.options.imagePath).catch((e) =>
        logger.warn("Failed to load the background image", e),
      );
    }
    if (this.options.blurRadius) {
      this.gl?.setBlurRadius(this.options.blurRadius);
    }
    this.gl?.setBackgroundDisabled(this.options.backgroundDisabled ?? false);
  }
}

/**
 * Whether a segmenter can be built here, asked once before any camera depends
 * on one: a pipeline that fails to build takes the camera down with it.
 */
export async function canSegment(): Promise<boolean> {
  try {
    (await createSegmenter(new OffscreenCanvas(1, 1))).close();
    return true;
  } catch (e) {
    logger.warn("Background effects cannot run here", e);
    return false;
  }
}

/** On the GPU, or on the CPU where the GPU refuses, as a blocklisted one does. */
async function createSegmenter(
  canvas: HTMLCanvasElement | OffscreenCanvas | undefined,
  segmenterOptions?: SegmenterOptions,
): Promise<ImageSegmenter> {
  const build = async (delegate: "GPU" | "CPU"): Promise<ImageSegmenter> =>
    ImageSegmenter.createFromOptions(wasmFileset, {
      baseOptions: { modelAssetPath, delegate, ...segmenterOptions },
      canvas,
      runningMode: "VIDEO",
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    });
  try {
    return await build("GPU");
  } catch (e) {
    logger.warn("Segmenting on the CPU, as the GPU refused", e);
    return build("CPU");
  }
}

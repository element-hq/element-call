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

import modelAssetPath from "../mediapipe/imageSegmenter/selfie_segmenter.tflite?url";

interface WasmFileset {
  /** The path to the Wasm loader script. */
  wasmLoaderPath: string;
  /** The path to the Wasm binary. */
  wasmBinaryPath: string;
}

// The MediaPipe package, by default, ships some alternative versions of the
// WASM files which avoid SIMD for compatibility with older browsers. But SIMD
// in WASM is actually fine by our support policy, so we include just the SIMD
// versions.
// It's really not ideal that we have to reference these internal files from
// MediaPipe and depend on node_modules having this specific structure. It's
// easy to see this breaking if our dependencies changed and MediaPipe were
// no longer hoisted, or if we switched to another dependency loader such as
// yarn PnP.
// https://github.com/google-ai-edge/mediapipe/issues/5961
const wasmFileset: WasmFileset = {
  wasmLoaderPath: new URL(
    "../../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js",
    import.meta.url,
  ).href,
  wasmBinaryPath: new URL(
    "../../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm",
    import.meta.url,
  ).href,
};

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
   * As the library's, except that disabling also drops the blur radius: kept,
   * it has every frame segmented and the result thrown away, where with
   * neither a radius nor a picture frames are passed on untouched.
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

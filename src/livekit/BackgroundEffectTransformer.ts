/*
Copyright 2024-2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  BackgroundTransformer,
  VideoTransformer,
  type VideoTransformerInitOptions,
} from "@livekit/track-processors";
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
 * Track processor that applies background effects — blur, or a replacement
 * image — to a user's camera.
 *
 * This is just like LiveKit's prebuilt BackgroundTransformer except that it
 * loads the segmentation models from our own bundle rather than as an external
 * resource fetched from the public internet. The library's own `assetPaths`
 * option cannot do this: it takes a directory and resolves the WASM through
 * MediaPipe's FilesetResolver, which picks its own variants, whereas we want
 * only the SIMD ones.
 */
export class BackgroundEffectTransformer extends BackgroundTransformer {
  /**
   * Called once, when a frame has actually come out of the pipeline.
   *
   * The promises say nothing useful about when that happens. Measured on four
   * devices, attaching resolves in about three seconds and switching in none
   * at all, and then a browser on the slow path spends another twelve to
   * fifteen seconds before the first frame appears. Only the frame itself
   * marks the end of the wait.
   */
  public onFirstFrame: (() => void) | undefined;
  private produced = false;

  public override async transform(
    frame: VideoFrame,
    controller: TransformStreamDefaultController<VideoFrame>,
  ): Promise<void> {
    await super.transform(frame, controller);
    if (!this.produced) {
      this.produced = true;
      this.onFirstFrame?.();
    }
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

    this.imageSegmenter = await ImageSegmenter.createFromOptions(wasmFileset, {
      baseOptions: {
        modelAssetPath,
        delegate: "GPU",
        ...this.options.segmenterOptions,
      },
      canvas: this.canvas,
      runningMode: "VIDEO",
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    });

    // BackgroundTransformer applies these at the end of its own init. Because
    // we replace init wholesale rather than extending it, we have to repeat
    // them, or an effect that was already selected when the pipeline starts is
    // silently ignored.
    if (this.options.imagePath) {
      await this.loadAndSetBackground(this.options.imagePath);
    }
    if (typeof this.options.blurRadius === "number") {
      this.gl?.setBlurRadius(this.options.blurRadius);
    }
    this.gl?.setBackgroundDisabled(this.options.backgroundDisabled ?? false);
  }
}

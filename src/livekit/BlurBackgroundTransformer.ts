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
// Yarn PnP.
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
export class BlurBackgroundTransformer extends BackgroundTransformer {
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

    if (this.options.blurRadius) {
      this.gl?.setBlurRadius(this.options.blurRadius);
    }
  }
}

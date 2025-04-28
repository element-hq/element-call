/*
Copyright 2024-2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
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

// n.b. this only includes the SIMD versions of the WASM files which have good support:
// https://caniuse.com/?search=simd
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

export class BlurBackgroundTransformer extends BackgroundTransformer {
  public async init({
    outputCanvas,
    inputElement: inputVideo,
  }: VideoTransformerInitOptions): Promise<void> {
    // call super.super.init()
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

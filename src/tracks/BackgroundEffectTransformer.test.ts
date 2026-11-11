/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BackgroundTransformer,
  VideoTransformer,
  type VideoTransformerInitOptions,
} from "@livekit/track-processors";
import { ImageSegmenter } from "@mediapipe/tasks-vision";

import {
  BackgroundEffectTransformer,
  canSegment,
} from "./BackgroundEffectTransformer";

const frame = {} as VideoFrame;
const controller = {} as TransformStreamDefaultController<VideoFrame>;
const stats = { processingTimeMs: 1, segmentationTimeMs: 1, filterTimeMs: 0 };

describe("BackgroundEffectTransformer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("loads a background chosen before it was built", async () => {
    vi.spyOn(VideoTransformer.prototype, "init").mockResolvedValue();
    vi.spyOn(ImageSegmenter, "createFromOptions").mockResolvedValue(
      {} as ImageSegmenter,
    );
    const load = vi
      .spyOn(BackgroundTransformer.prototype, "loadAndSetBackground")
      .mockResolvedValue();
    const transformer = new BackgroundEffectTransformer({
      backgroundDisabled: true,
    });
    // Chosen before the camera is processed, as the first effect always is:
    // loaded then, there is nothing yet to draw it with.
    await transformer.update({ imagePath: "/background.jpg" });
    load.mockClear();

    await transformer.init({} as VideoTransformerInitOptions);
    expect(load).toHaveBeenCalledWith("/background.jpg");
  });

  it("runs MediaPipe from its own bundle", async () => {
    vi.spyOn(VideoTransformer.prototype, "init").mockResolvedValue();
    const create = vi
      .spyOn(ImageSegmenter, "createFromOptions")
      .mockResolvedValue({} as ImageSegmenter);

    await new BackgroundEffectTransformer({ backgroundDisabled: true }).init(
      {} as VideoTransformerInitOptions,
    );

    const [fileset, options] = create.mock.calls[0];
    expect(fileset.wasmLoaderPath).toMatch(/vision_wasm_internal\.js/);
    expect(fileset.wasmBinaryPath).toMatch(/vision_wasm_internal\.wasm/);
    expect(options.baseOptions?.modelAssetPath).toMatch(
      /selfie_segmenter\.tflite/,
    );
  });

  it("reports the first frame carrying an effect, once", async () => {
    // The library reports every frame it draws.
    vi.spyOn(BackgroundTransformer.prototype, "transform").mockImplementation(
      async function (this: BackgroundTransformer) {
        this.options.onFrameProcessed?.(stats);
        return Promise.resolve();
      },
    );
    const transformer = new BackgroundEffectTransformer({});
    transformer.onFirstFrame = vi.fn();

    await transformer.transform(frame, controller);
    await transformer.transform(frame, controller);
    expect(transformer.onFirstFrame).toHaveBeenCalledTimes(1);
  });

  it("does not report a frame passed through untouched", async () => {
    vi.spyOn(BackgroundTransformer.prototype, "transform").mockResolvedValue();
    const transformer = new BackgroundEffectTransformer({
      backgroundDisabled: true,
    });
    transformer.onFirstFrame = vi.fn();

    await transformer.transform(frame, controller);
    expect(transformer.onFirstFrame).not.toHaveBeenCalled();
  });

  it("keeps reporting drawn frames to whoever asked", async () => {
    vi.spyOn(BackgroundTransformer.prototype, "transform").mockImplementation(
      async function (this: BackgroundTransformer) {
        this.options.onFrameProcessed?.(stats);
        return Promise.resolve();
      },
    );
    const onFrameProcessed = vi.fn();
    const transformer = new BackgroundEffectTransformer({ onFrameProcessed });

    await transformer.transform(frame, controller);
    expect(onFrameProcessed).toHaveBeenCalledWith(stats);
  });

  it("never sends the first frame on untouched", async () => {
    // The library copies its first frame through untouched, ahead of the
    // drawn one, unless told the first frame is past
    const seen: boolean[] = [];
    vi.spyOn(BackgroundTransformer.prototype, "transform").mockImplementation(
      async function (this: BackgroundTransformer) {
        seen.push(this.isFirstFrame);
        return Promise.resolve();
      },
    );
    const transformer = new BackgroundEffectTransformer({});
    expect(transformer.isFirstFrame).toBe(true);

    await transformer.transform(frame, controller);
    expect(seen).toEqual([false]);
  });

  it("passes frames on untouched once disabled, even after blurring", async () => {
    const transformer = new BackgroundEffectTransformer({});
    await transformer.update({ blurRadius: 15, backgroundDisabled: false });
    await transformer.update({
      imagePath: undefined,
      backgroundDisabled: true,
    });
    // With neither, the library passes a frame on without segmenting it.
    expect(transformer.options.blurRadius).toBeUndefined();
    expect(transformer.options.imagePath).toBeUndefined();
  });

  it("segments on the CPU where the GPU refuses", async () => {
    vi.spyOn(VideoTransformer.prototype, "init").mockResolvedValue();
    const build = vi
      .spyOn(ImageSegmenter, "createFromOptions")
      .mockRejectedValueOnce(new Error("blocklisted"))
      .mockResolvedValue({} as ImageSegmenter);

    await new BackgroundEffectTransformer({}).init(
      {} as VideoTransformerInitOptions,
    );
    expect(build.mock.calls.map(([, o]) => o.baseOptions?.delegate)).toEqual([
      "GPU",
      "CPU",
    ]);
  });

  it("says whether a segmenter can be built at all", async () => {
    vi.stubGlobal("OffscreenCanvas", class {});
    const close = vi.fn();
    const build = vi
      .spyOn(ImageSegmenter, "createFromOptions")
      .mockResolvedValue({ close } as unknown as ImageSegmenter);
    expect(await canSegment()).toBe(true);
    expect(close).toHaveBeenCalled();

    build.mockRejectedValue(new Error("no model"));
    expect(await canSegment()).toBe(false);
  });
});

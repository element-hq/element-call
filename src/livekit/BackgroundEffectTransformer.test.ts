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

import { BackgroundEffectTransformer } from "./BackgroundEffectTransformer";

const frame = {} as VideoFrame;
const controller = {} as TransformStreamDefaultController<VideoFrame>;

describe("BackgroundEffectTransformer", () => {
  afterEach(() => vi.restoreAllMocks());

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

  it("reports the first frame carrying an effect, once", async () => {
    vi.spyOn(BackgroundTransformer.prototype, "transform").mockImplementation(
      async function (this: BackgroundTransformer) {
        this.isFirstFrame = false;
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
});

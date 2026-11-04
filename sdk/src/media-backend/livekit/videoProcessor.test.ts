/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  Track,
  type TrackProcessor,
  type VideoProcessorOptions,
} from "livekit-client";
import { describe, expect, it, vi } from "vitest";

import { type VideoProcessor } from "../../media-api";
import { fromLivekitProcessor, toLivekitProcessor } from "./videoProcessor";

describe("toLivekitProcessor", () => {
  const captured = { id: "captured" } as MediaStreamTrack;
  const processed = { id: "processed" } as MediaStreamTrack;
  const restarted = { id: "restarted" } as MediaStreamTrack;
  const element = document.createElement("video");
  const options: VideoProcessorOptions = {
    kind: Track.Kind.Video,
    track: captured,
    element,
  };

  function fakeProcessor(): VideoProcessor {
    return {
      name: "blur",
      init: vi.fn().mockResolvedValue(processed),
      restart: vi.fn().mockResolvedValue(restarted),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("holds the processed track where LiveKit reads it", async () => {
    const processor = fakeProcessor();
    const adapter = toLivekitProcessor(processor);
    expect(adapter.name).toBe("blur");
    expect(adapter.processedTrack).toBeUndefined();

    await adapter.init(options);
    expect(processor.init).toHaveBeenCalledWith(captured, element);
    expect(adapter.processedTrack).toBe(processed);

    await adapter.restart(options);
    expect(adapter.processedTrack).toBe(restarted);

    await adapter.destroy();
    expect(processor.destroy).toHaveBeenCalled();
  });

  // A stopped track tears its processor down without waiting, while the track
  // replacing it initialises the same one
  it("runs a destroy and the next init on one processor in turn, across adapters", async () => {
    const processor = fakeProcessor();
    let finishDestroy = (): void => {};
    vi.mocked(processor.destroy).mockImplementation(
      async () =>
        new Promise<void>((resolve) => {
          finishDestroy = resolve;
        }),
    );
    const previous = toLivekitProcessor(processor);
    const next = toLivekitProcessor(processor);

    const destroying = previous.destroy();
    const initialising = next.init(options);
    await Promise.resolve();
    expect(processor.init).not.toHaveBeenCalled();

    finishDestroy();
    await Promise.all([destroying, initialising]);
    expect(processor.init).toHaveBeenCalledOnce();
    expect(next.processedTrack).toBe(processed);
  });
});

describe("fromLivekitProcessor", () => {
  const captured = { id: "captured" } as MediaStreamTrack;
  const processed = { id: "processed" } as MediaStreamTrack;

  function fakeLivekitProcessor(
    processedTrack: MediaStreamTrack | undefined,
  ): TrackProcessor<Track.Kind.Video> {
    return {
      name: "background-blur",
      processedTrack,
      init: vi.fn().mockResolvedValue(undefined),
      restart: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("resolves with the track the LiveKit processor produced", async () => {
    const livekitProcessor = fakeLivekitProcessor(processed);
    const processor = fromLivekitProcessor(livekitProcessor);
    expect(processor.name).toBe("background-blur");
    await expect(processor.init(captured)).resolves.toBe(processed);
    expect(livekitProcessor.init).toHaveBeenCalledWith({
      kind: Track.Kind.Video,
      track: captured,
    });
    await expect(processor.restart(captured)).resolves.toBe(processed);
    await processor.destroy();
    expect(livekitProcessor.destroy).toHaveBeenCalled();
  });

  it("rejects where the LiveKit processor produced no track", async () => {
    await expect(
      fromLivekitProcessor(fakeLivekitProcessor(undefined)).init(captured),
    ).rejects.toThrow("produced no track");
  });
});

/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";
import { type LocalVideoTrack } from "livekit-client";
import {
  type BackgroundOptions,
  type ProcessorWrapper,
} from "@livekit/track-processors";
import { type VideoProcessor } from "@element-hq/matrixrtc-sdk";

import {
  applyProcessor,
  fromLivekitProcessor,
  trackProcessorSync,
} from "./TrackProcessorContext";
import { constant } from "../state/Behavior";
import { flushPromises, testScope } from "../utils/test";

const processor = { name: "blur" } as VideoProcessor;

function mockTrack(
  readyState: MediaStreamTrackState,
  current?: VideoProcessor,
): LocalVideoTrack {
  return {
    mediaStreamTrack: { readyState },
    getProcessor: vi.fn().mockReturnValue(current),
    setProcessor: vi.fn().mockResolvedValue(undefined),
    stopProcessor: vi.fn().mockResolvedValue(undefined),
  } as unknown as LocalVideoTrack;
}

describe("applyProcessor", () => {
  it("attaches the processor to a live track", () => {
    const track = mockTrack("live");
    applyProcessor(track, processor);
    expect(track.setProcessor).toHaveBeenCalledWith(
      expect.objectContaining({ name: "blur" }),
    );
  });

  it("does not attach the processor to an ended track", () => {
    const track = mockTrack("ended");
    applyProcessor(track, processor);
    expect(track.setProcessor).not.toHaveBeenCalled();
  });

  it("does not surface a rejected setProcessor", async () => {
    const track = mockTrack("live");
    vi.mocked(track.setProcessor).mockRejectedValue(
      new TypeError("Input track cannot be ended"),
    );
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    applyProcessor(track, processor);
    await flushPromises();
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("stops the processor when none is wanted", () => {
    const track = mockTrack("live", processor);
    applyProcessor(track, undefined);
    expect(track.stopProcessor).toHaveBeenCalled();
  });

  it("does not surface a rejected stopProcessor", async () => {
    const track = mockTrack("live", processor);
    vi.mocked(track.stopProcessor).mockRejectedValue(new Error("nope"));
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    applyProcessor(track, undefined);
    await flushPromises();
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe("trackProcessorSync", () => {
  it("applies the processor to the current track", () => {
    const track = mockTrack("live");
    trackProcessorSync(
      testScope(),
      constant(track),
      constant({ supported: true, processor }),
    );
    expect(track.setProcessor).toHaveBeenCalledWith(
      expect.objectContaining({ name: "blur" }),
    );
  });
});

describe("fromLivekitProcessor", () => {
  const captured = { id: "captured" } as MediaStreamTrack;
  const processed = { id: "processed" } as MediaStreamTrack;

  function mockWrapper(
    processedTrack: MediaStreamTrack | undefined,
  ): ProcessorWrapper<BackgroundOptions> {
    return {
      name: "background-blur",
      processedTrack,
      init: vi.fn().mockResolvedValue(undefined),
      restart: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
    } as unknown as ProcessorWrapper<BackgroundOptions>;
  }

  it("resolves with the track the wrapper produced", async () => {
    const wrapper = mockWrapper(processed);
    const sdkProcessor = fromLivekitProcessor(wrapper);
    expect(sdkProcessor.name).toBe("background-blur");
    await expect(sdkProcessor.init(captured)).resolves.toBe(processed);
    expect(wrapper.init).toHaveBeenCalledWith({
      kind: "video",
      track: captured,
    });
    await expect(sdkProcessor.restart(captured)).resolves.toBe(processed);
    await sdkProcessor.destroy();
    expect(wrapper.destroy).toHaveBeenCalled();
  });

  it("rejects where the wrapper produced no track", async () => {
    await expect(
      fromLivekitProcessor(mockWrapper(undefined)).init(captured),
    ).rejects.toThrow("produced no track");
  });
});

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

import { applyProcessor, trackProcessorSync } from "./TrackProcessorContext";
import { constant } from "../state/Behavior";
import { flushPromises, testScope } from "../utils/test";

const processor = {} as ProcessorWrapper<BackgroundOptions>;

function mockTrack(
  readyState: MediaStreamTrackState,
  current?: ProcessorWrapper<BackgroundOptions>,
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
    expect(track.setProcessor).toHaveBeenCalledWith(processor);
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
    expect(track.setProcessor).toHaveBeenCalledWith(processor);
  });
});

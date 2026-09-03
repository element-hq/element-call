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

import { applyProcessor } from "./TrackProcessorContext";

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
    await new Promise((r) => setTimeout(r, 0));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("stops the processor when none is wanted", () => {
    const track = mockTrack("live", processor);
    applyProcessor(track, undefined);
    expect(track.stopProcessor).toHaveBeenCalled();
  });
});

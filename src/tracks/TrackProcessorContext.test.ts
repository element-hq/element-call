/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";
import {
  type BackgroundOptions,
  type ProcessorWrapper,
} from "@livekit/track-processors";

import { fromLivekitProcessor } from "./TrackProcessorContext";

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

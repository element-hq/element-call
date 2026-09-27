/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/lib/logger";
import { describe, expect, it, vi } from "vitest";

import { nullHostBridge } from "../../../HostBridge.ts";
import { ScreenShareAudioSessionCoordinator } from "./ScreenShareAudioSessionCoordinator.ts";

function coordinator(
  send: (
    state: "acquire" | "release",
    sessionId: string,
  ) => Promise<{ accepted: boolean }>,
  enabled = true,
): ScreenShareAudioSessionCoordinator {
  return new ScreenShareAudioSessionCoordinator(
    {
      ...nullHostBridge,
      supportsIsolatedScreenShareAudio: enabled,
      acquireIsolatedScreenShareAudio: async (sessionId) =>
        (await send("acquire", sessionId)).accepted,
      releaseIsolatedScreenShareAudio: async (sessionId) =>
        (await send("release", sessionId)).accepted,
    },
    logger,
  );
}

describe("ScreenShareAudioSessionCoordinator", () => {
  it("does nothing when the generic capability is disabled", async () => {
    const send = vi.fn();
    expect(await coordinator(send, false).acquire()).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it("acquires with an opaque UUID and releases exactly once", async () => {
    const send = vi.fn().mockResolvedValue({ accepted: true });
    const sessions = coordinator(send);
    const acquired = await sessions.acquire();

    expect(acquired?.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(send).toHaveBeenNthCalledWith(1, "acquire", acquired?.sessionId);

    await sessions.release(acquired?.sessionId);
    await sessions.release(acquired?.sessionId);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(2, "release", acquired?.sessionId);
  });

  it.each([
    async () => await Promise.resolve({ accepted: false }),
    async () => await Promise.reject(new Error("transport unavailable")),
  ])(
    "falls back without owning a session when acquire is rejected",
    async (response) => {
      const send = vi.fn().mockImplementation(response);
      const sessions = coordinator(send);
      expect(await sessions.acquire()).toBeNull();
      expect(sessions.current).toBeNull();
      await sessions.release();
      expect(send).toHaveBeenCalledOnce();
    },
  );

  it("releases a replacement before acquiring its successor and ignores stale release", async () => {
    const send = vi.fn().mockResolvedValue({ accepted: true });
    const sessions = coordinator(send);
    const first = await sessions.acquire();
    const second = await sessions.acquire();
    await sessions.release(first?.sessionId);
    expect(sessions.current).toBe(second?.sessionId);
    await sessions.release(second?.sessionId);
    expect(send.mock.calls.map(([state]) => state)).toEqual([
      "acquire",
      "release",
      "acquire",
      "release",
    ]);
  });
});

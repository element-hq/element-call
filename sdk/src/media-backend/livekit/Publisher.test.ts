/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { EventEmitter } from "events";
import { ConnectionState, type Room as LivekitRoom } from "livekit-client";
import { logger } from "matrix-js-sdk/lib/logger";
import { describe, expect, it, vi } from "vitest";

import { Publisher } from "./Publisher";

describe("Publisher", () => {
  describe("setAudioOutputDevice", () => {
    it("switches the room's output while the room is still connecting", async () => {
      const { room, switchActiveDevice } = fakeRoom(ConnectionState.Connecting);
      const publisher = new Publisher(room, new Map(), logger);

      await publisher.setAudioOutputDevice("speaker");
      expect(switchActiveDevice).toHaveBeenCalledWith("audiooutput", "speaker");
    });

    it("leaves a room alone that already plays on the device", async () => {
      const { room, switchActiveDevice } = fakeRoom(
        ConnectionState.Connected,
        "speaker",
      );
      const publisher = new Publisher(room, new Map(), logger);

      await publisher.setAudioOutputDevice("speaker");
      expect(switchActiveDevice).not.toHaveBeenCalled();
    });

    it("rejects where the room cannot switch", async () => {
      const { room, switchActiveDevice } = fakeRoom(ConnectionState.Connected);
      switchActiveDevice.mockRejectedValue(new Error("no setSinkId"));
      const publisher = new Publisher(room, new Map(), logger);

      await expect(publisher.setAudioOutputDevice("speaker")).rejects.toThrow(
        "no setSinkId",
      );
    });
  });
});

/** The slice of a LiveKit room the publisher touches at construction and for the output device. */
function fakeRoom(
  state: ConnectionState,
  activeOutput?: string,
): { room: LivekitRoom; switchActiveDevice: ReturnType<typeof vi.fn> } {
  const switchActiveDevice = vi.fn(async () => Promise.resolve(true));
  const room = {
    state,
    options: {},
    setE2EEEnabled: () => undefined,
    localParticipant: new EventEmitter(),
    getActiveDevice: () => activeOutput,
    switchActiveDevice,
  } as unknown as LivekitRoom;
  return { room, switchActiveDevice };
}

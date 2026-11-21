/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";
import {
  ClientEvent,
  createClient,
  type MatrixClient,
  Room,
  RoomEvent,
  SyncState,
} from "matrix-js-sdk";

import { createSdkMatrixBackend, withEmitter } from "./SdkMatrixBackend";

describe("createSdkMatrixBackend", () => {
  it("calls each member on the client or the room it came from", () => {
    const { client, room } = setup();
    const backend = createSdkMatrixBackend(client, room);

    expect(backend.getUserId()).toBe("@alice:example.org");
    expect(backend.roomId).toBe("!room:example.org");
    expect(backend.getVersion()).toBe(room.getVersion());
  });

  it("keeps the client's and the room's events apart", () => {
    const { client, room } = setup();
    const backend = createSdkMatrixBackend(client, room);
    const onClient = vi.fn();
    const onRoom = vi.fn();
    backend.clientEmitter.on(ClientEvent.Sync, onClient);
    backend.roomEmitter.on(RoomEvent.Name, onRoom);

    client.emit(ClientEvent.Sync, SyncState.Syncing, null);
    expect(onClient).toHaveBeenCalledOnce();
    expect(onRoom).not.toHaveBeenCalled();

    room.emit(RoomEvent.Name, room);
    expect(onRoom).toHaveBeenCalledOnce();
  });
});

describe("withEmitter", () => {
  it("is the backend with one side's events", () => {
    const { client, room } = setup();
    const backend = createSdkMatrixBackend(client, room);
    const asRoom = withEmitter(backend, backend.roomEmitter);
    const listener = vi.fn();

    asRoom.on(RoomEvent.Name, listener);
    room.emit(RoomEvent.Name, room);

    expect(listener).toHaveBeenCalledOnce();
    expect(asRoom.getUserId()).toBe("@alice:example.org");
  });

  it("reads the backend's getters through", () => {
    const { room } = setup();
    const asRoom = withEmitter(
      {
        get name() {
          return room.name;
        },
      },
      room,
    );

    room.name = "Renamed";
    expect(asRoom.name).toBe("Renamed");
  });
});

function setup(): { client: MatrixClient; room: Room } {
  const client = createClient({
    baseUrl: "https://matrix.example.org",
    userId: "@alice:example.org",
    deviceId: "DEVICE",
  });
  const room = new Room("!room:example.org", client, "@alice:example.org");
  return { client, room };
}

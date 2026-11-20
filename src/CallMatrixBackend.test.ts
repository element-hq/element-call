/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "vitest";
import { createClient, Room } from "matrix-js-sdk";
import { withEmitter } from "@element-hq/matrixrtc-sdk";

import { createCallMatrixBackend } from "./CallMatrixBackend";

test("has the SDK's part and the call's own", () => {
  const { backend, room } = setup();

  expect(backend.getUserId()).toBe("@alice:example.org");
  expect(backend.getJoinRule()).toBe(room.getJoinRule());
  expect(backend.relations).toBe(room.relations);
});

test("reads the room's name as it is now, also as a room", () => {
  const { backend, room } = setup();
  const asRoom = withEmitter(backend, backend.roomEmitter);

  room.name = "Renamed";
  expect(backend.name).toBe("Renamed");
  expect(asRoom.name).toBe("Renamed");
});

function setup(): {
  backend: ReturnType<typeof createCallMatrixBackend>;
  room: Room;
} {
  const client = createClient({
    baseUrl: "https://matrix.example.org",
    userId: "@alice:example.org",
    deviceId: "DEVICE",
  });
  const room = new Room("!room:example.org", client, "@alice:example.org");
  return { backend: createCallMatrixBackend(client, room), room };
}

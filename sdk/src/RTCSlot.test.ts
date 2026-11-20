/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";
import { type MatrixClient, type Room } from "matrix-js-sdk";
import { EventType } from "matrix-js-sdk/lib/@types/event";
import { type MatrixEvent } from "matrix-js-sdk/lib/models/event";
import {
  type RoomState,
  RoomStateEvent,
} from "matrix-js-sdk/lib/models/room-state";

import { MatrixRTCSessionEvent } from "matrix-js-sdk/lib/matrixrtc";

import { createRTCSlot } from "./RTCSlot";
import { type RTCSlotOptions } from "./api";
import { E2eeType } from "./encryption";
import {
  mockEmitter,
  mockRtcMembership,
  MockRTCSession,
  testScope,
} from "./utils/test";

const options: RTCSlotOptions = {
  encryptionSystem: { kind: E2eeType.NONE },
};

function setup(): {
  client: MatrixClient;
  room: Room;
  session: MockRTCSession;
} {
  const room = {
    ...mockEmitter(),
    roomId: "!room:example.org",
    getMembersWithMembership: (): [] => [],
  } as unknown as Room;
  const session = new MockRTCSession(room);
  const client = {
    getUserId: (): string => "@alice:example.org",
    getDeviceId: (): string => "AAAA",
  } as unknown as MatrixClient;
  return { client, room, session };
}

describe("createRTCSlot", () => {
  describe("status$", () => {
    it("is undefined while the room has no slot event", () => {
      const { client, room, session } = setup();
      const slot = createRTCSlot(
        testScope(),
        client,
        room,
        options,
        session.asMockedSession(),
      );
      expect(slot.status$.value).toBeUndefined();
    });

    it("follows the slot event", () => {
      const { client, room, session } = setup();
      session.rtcSlot = { status: "open" };
      const slot = createRTCSlot(
        testScope(),
        client,
        room,
        options,
        session.asMockedSession(),
      );
      expect(slot.status$.value).toBe("open");

      session.rtcSlot = { status: "closed" };
      room.emit(
        RoomStateEvent.Events,
        { getType: (): string => EventType.RTCSlot } as MatrixEvent,
        {} as RoomState,
        null,
      );
      expect(slot.status$.value).toBe("closed");
    });
  });

  describe("members$", () => {
    it("keeps the member when its membership is sent again, with the new event id", () => {
      const { client, room, session } = setup();
      const first = mockRtcMembership("@bob:example.org", "BOB");
      session.memberships = [first];
      const slot = createRTCSlot(
        testScope(),
        client,
        room,
        options,
        session.asMockedSession(),
      );
      const [bob] = slot.members$.value;
      expect(bob.matrixEventId$.value).toBe(first.eventId);

      const resent = mockRtcMembership("@bob:example.org", "BOB");
      session.memberships = [resent];
      session.emit(MatrixRTCSessionEvent.MembershipsChanged, [first], [resent]);
      expect(slot.members$.value).toHaveLength(1);
      expect(slot.members$.value[0]).toBe(bob);
      expect(bob.matrixEventId$.value).toBe(resent.eventId);
      expect(resent.eventId).not.toBe(first.eventId);
    });
  });
});

/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { renderHook } from "@testing-library/react";
import {
  EventType,
  JoinRule,
  KnownMembership,
  type MatrixClient,
  MatrixEvent,
  type Room,
} from "matrix-js-sdk";
import { describe, expect, test } from "vitest";

import { useGroupCallRooms } from "./useGroupCallRooms";
import { mockMatrixRoom } from "../utils/test";

describe("useGroupCallRooms", () => {
  test("lists a joined room with legacy call member state", () => {
    const room = mockCallRoom({ legacyMemberState: true });
    expect(listedRoomIds([room])).toEqual([room.roomId]);
  });

  test("lists a joined room with a sticky RTC membership", () => {
    const room = mockCallRoom({
      stickyEvents: [new MatrixEvent({ type: EventType.RTCMembership })],
    });
    expect(listedRoomIds([room])).toEqual([room.roomId]);
  });

  test("lists a joined room with an RTC membership in its timeline", () => {
    const room = mockCallRoom({
      timelineEvents: [new MatrixEvent({ type: EventType.RTCMembership })],
    });
    expect(listedRoomIds([room])).toEqual([room.roomId]);
  });

  test("lists a knocked room without any call events", () => {
    const room = mockCallRoom({
      membership: KnownMembership.Knock,
      joinRule: JoinRule.Knock,
    });
    expect(listedRoomIds([room])).toEqual([room.roomId]);
  });

  test("omits a joined room without any call events", () => {
    const room = mockCallRoom({
      stickyEvents: [new MatrixEvent({ type: EventType.RoomMessage })],
      timelineEvents: [new MatrixEvent({ type: EventType.RoomMessage })],
    });
    expect(listedRoomIds([room])).toEqual([]);
  });

  test.each([KnownMembership.Invite, KnownMembership.Leave])(
    "omits a room with %s membership despite call events",
    (membership) => {
      const room = mockCallRoom({
        membership,
        legacyMemberState: true,
        stickyEvents: [new MatrixEvent({ type: EventType.RTCMembership })],
        timelineEvents: [new MatrixEvent({ type: EventType.RTCMembership })],
      });
      expect(listedRoomIds([room])).toEqual([]);
    },
  );
});

function listedRoomIds(rooms: Room[]): string[] {
  const client = {
    getRooms: () => rooms,
    getUserId: () => "@alice:example.org",
    on: () => {},
    off: () => {},
    matrixRTC: {
      getRoomSession: () => ({ memberships: [] }),
      on: () => {},
      off: () => {},
    },
  } as unknown as MatrixClient;
  const { result } = renderHook(() => useGroupCallRooms(client));
  return result.current.map(({ room }) => room.roomId);
}

let nextRoomId = 0;

function mockCallRoom({
  membership = KnownMembership.Join,
  joinRule = JoinRule.Public,
  legacyMemberState = false,
  stickyEvents = [],
  timelineEvents = [],
}: {
  membership?: KnownMembership;
  joinRule?: JoinRule;
  legacyMemberState?: boolean;
  stickyEvents?: MatrixEvent[];
  timelineEvents?: MatrixEvent[];
}): Room {
  const stateEvents = new Map(
    legacyMemberState ? [[EventType.GroupCallMemberPrefix, new Map()]] : [],
  );
  return mockMatrixRoom({
    roomId: `!room${nextRoomId++}:example.org`,
    name: "Call room",
    getMyMembership: () => membership,
    getJoinRule: () => joinRule,
    hasEncryptionStateEvent: () => true,
    getCanonicalAlias: () => null,
    getMxcAvatarUrl: () => null,
    getLiveTimeline: () =>
      ({
        getState: () => ({ events: stateEvents }),
        getEvents: () => timelineEvents,
      }) as unknown as ReturnType<Room["getLiveTimeline"]>,
    _unstable_getStickyEvents: () =>
      stickyEvents as unknown as ReturnType<Room["_unstable_getStickyEvents"]>,
  });
}

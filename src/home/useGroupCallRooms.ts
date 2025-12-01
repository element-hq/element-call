/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type MatrixClient,
  type RoomMember,
  type Room,
  RoomEvent,
  EventTimeline,
  EventType,
  JoinRule,
  KnownMembership,
} from "matrix-js-sdk";
import { useState, useEffect } from "react";
import {
  MatrixRTCSessionManagerEvents,
  type MatrixRTCSession,
} from "matrix-js-sdk/lib/matrixrtc";

import { getKeyForRoom } from "../e2ee/sharedKeyManagement";

export interface GroupCallRoom {
  roomAlias?: string;
  roomName: string;
  avatarUrl: string;
  room: Room;
  session: MatrixRTCSession;
  participants: RoomMember[];
}
const tsCache: { [index: string]: number } = {};

function getLastTs(client: MatrixClient, r: Room): number {
  if (tsCache[r.roomId]) {
    return tsCache[r.roomId];
  }

  if (!r || !r.timeline) {
    const ts = Number.MAX_SAFE_INTEGER;
    tsCache[r.roomId] = ts;
    return ts;
  }

  const myUserId = client.getUserId()!;

  if (r.getMyMembership() !== KnownMembership.Join) {
    const membershipEvent = r.currentState.getStateEvents(
      "m.room.member",
      myUserId,
    );

    if (membershipEvent && !Array.isArray(membershipEvent)) {
      const ts = membershipEvent.getTs();
      tsCache[r.roomId] = ts;
      return ts;
    }
  }

  for (let i = r.timeline.length - 1; i >= 0; --i) {
    const ev = r.timeline[i];
    const ts = ev.getTs();

    if (ts) {
      tsCache[r.roomId] = ts;
      return ts;
    }
  }

  const ts = Number.MAX_SAFE_INTEGER;
  tsCache[r.roomId] = ts;
  return ts;
}

function sortRooms(client: MatrixClient, rooms: Room[]): Room[] {
  return rooms.sort((a, b) => {
    return getLastTs(client, b) - getLastTs(client, a);
  });
}

const roomIsJoinable = (room: Room): boolean => {
  const password = getKeyForRoom(room.roomId);
  if (!room.hasEncryptionStateEvent() && !password) {
    // if we have a non encrypted room (no encryption state event) we need a locally stored shared key.
    // in case this key also does not exists we cannot join the room.
    return false;
  }
  // otherwise we can always join rooms because we will automatically decide if we want to use perParticipant or password
  switch (room.getJoinRule()) {
    case JoinRule.Public:
      return true;
    case JoinRule.Knock:
      switch (room.getMyMembership()) {
        case KnownMembership.Join:
        case KnownMembership.Knock:
          return true;
        case KnownMembership.Invite:
          return (
            room
              .getLiveTimeline()
              .getState(EventTimeline.FORWARDS)
              ?.getStateEvents(EventType.RoomMember, room.myUserId)
              ?.getPrevContent().membership === JoinRule.Knock
          );
        default:
          return false;
      }
    // TODO: check JoinRule.Restricted and return true if join condition is satisfied
    default:
      return room.getMyMembership() === KnownMembership.Join;
  }
};

/**
 * Determines if a given room has call events in it, and therefore
 * is likely to be a call room.
 * @param room The Matrix room instance.
 * @returns `true` if the room has call events.
 */
const roomHasCallMembershipEvents = (room: Room): boolean => {
  // Check our room membership first, to rule out any rooms
  // we can't have a call in.
  const myMembership = room.getMyMembership();
  if (myMembership === KnownMembership.Knock) {
    // Assume that a room you've knocked on is able to hold calls
    return true;
  } else if (myMembership !== KnownMembership.Join) {
    // Otherwise, non-joined rooms should never show up.
    return false;
  }

  // Legacy member state checks (cheaper to check.)
  const timeline = room.getLiveTimeline();
  if (
    timeline
      .getState(EventTimeline.FORWARDS)
      ?.events?.has(EventType.GroupCallMemberPrefix)
  ) {
    return true;
  }

  // Check for *active* calls using sticky events.
  for (const sticky of room._unstable_getStickyEvents()) {
    if (sticky.getType() === EventType.RTCMembership) {
      return true;
    }
  }

  // Otherwise, check recent event history to see if anyone had
  // sent a call membership in here.
  return timeline.getEvents().some(
    (e) =>
      // Membership events only count if both of these are true
      e.unstableStickyInfo && e.getType() === EventType.GroupCallMemberPrefix,
  );
  // Otherwise, it's *unlikely* this room was ever a call.
};

export function useGroupCallRooms(client: MatrixClient): GroupCallRoom[] {
  const [rooms, setRooms] = useState<GroupCallRoom[]>([]);

  useEffect(() => {
    function updateRooms(): void {
      // We want to show all rooms that historically had a call and which we are (or can become) part of.
      const rooms = client
        .getRooms()
        .filter(roomHasCallMembershipEvents)
        .filter(roomIsJoinable);
      const sortedRooms = sortRooms(client, rooms);
      const items = sortedRooms.map((room) => {
        const session = client.matrixRTC.getRoomSession(room);
        return {
          roomAlias: room.getCanonicalAlias() ?? undefined,
          roomName: room.name,
          avatarUrl: room.getMxcAvatarUrl()!,
          room,
          session,
          participants: session.memberships
            .filter((m) => m.sender)
            .map((m) => room.getMember(m.sender!))
            .filter((m) => m) as RoomMember[],
        };
      });

      setRooms(items);
    }

    updateRooms();

    client.matrixRTC.on(
      MatrixRTCSessionManagerEvents.SessionStarted,
      updateRooms,
    );
    client.on(RoomEvent.MyMembership, updateRooms);
    return (): void => {
      client.matrixRTC.off(
        MatrixRTCSessionManagerEvents.SessionStarted,
        updateRooms,
      );
      client.off(RoomEvent.MyMembership, updateRooms);
    };
  }, [client]);

  return rooms;
}

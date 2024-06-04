/*
Copyright 2022 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { MatrixClient } from "matrix-js-sdk/src/client";
import { Room, RoomEvent } from "matrix-js-sdk/src/models/room";
import { RoomMember } from "matrix-js-sdk/src/models/room-member";
import { useState, useEffect } from "react";
import { EventTimeline, EventType, JoinRule } from "matrix-js-sdk";
import { MatrixRTCSession } from "matrix-js-sdk/src/matrixrtc/MatrixRTCSession";
import { MatrixRTCSessionManagerEvents } from "matrix-js-sdk/src/matrixrtc/MatrixRTCSessionManager";
import { KnownMembership } from "matrix-js-sdk/src/types";

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
  if (!room.hasEncryptionStateEvent() && !getKeyForRoom(room.roomId)) {
    // if we have an non encrypted room (no encryption state event) we need a locally stored shared key.
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

const roomHasCallMembershipEvents = (room: Room): boolean => {
  switch (room.getMyMembership()) {
    case KnownMembership.Join:
      return !!room
        .getLiveTimeline()
        .getState(EventTimeline.FORWARDS)
        ?.events?.get(EventType.GroupCallMemberPrefix);
    case KnownMembership.Knock:
      // Assume that a room you've knocked on is able to hold calls
      return true;
    default:
      return false;
  }
};

export function useGroupCallRooms(client: MatrixClient): GroupCallRoom[] {
  const [rooms, setRooms] = useState<GroupCallRoom[]>([]);

  useEffect(() => {
    function updateRooms(): void {
      // We want to show all rooms that historically had a call and which we are (can become) part of.
      const rooms = client
        .getRooms()
        .filter(roomHasCallMembershipEvents)
        .filter(roomIsJoinable);
      const sortedRooms = sortRooms(client, rooms);
      const items = sortedRooms.map((room) => {
        const session = client.matrixRTC.getRoomSession(room);
        session.memberships;
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

/*
Copyright 2022 Matrix.org Foundation C.I.C.

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

import { GroupCall, MatrixClient, Room, RoomMember } from "matrix-js-sdk";
import { GroupCallEventHandlerEvent } from "matrix-js-sdk/src/webrtc/groupCallEventHandler";
import { useState, useEffect } from "react";

export interface GroupCallRoom {
  roomId: string;
  roomName: string;
  avatarUrl: string;
  room: Room;
  groupCall: GroupCall;
  participants: RoomMember[];
}
const tsCache: { [index: string]: number } = {};

function getLastTs(client: MatrixClient, r: Room) {
  if (tsCache[r.roomId]) {
    return tsCache[r.roomId];
  }

  if (!r || !r.timeline) {
    const ts = Number.MAX_SAFE_INTEGER;
    tsCache[r.roomId] = ts;
    return ts;
  }

  const myUserId = client.getUserId();

  if (r.getMyMembership() !== "join") {
    const membershipEvent = r.currentState.getStateEvents(
      "m.room.member",
      myUserId
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

export function useGroupCallRooms(client: MatrixClient): GroupCallRoom[] {
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    function updateRooms() {
      const groupCalls = client.groupCallEventHandler.groupCalls.values();
      const rooms = Array.from(groupCalls).map((groupCall) => groupCall.room);
      const sortedRooms = sortRooms(client, rooms);
      const items = sortedRooms.map((room) => {
        const groupCall = client.getGroupCallForRoom(room.roomId);

        return {
          roomId: room.getCanonicalAlias() || room.roomId,
          roomName: room.name,
          avatarUrl: room.getMxcAvatarUrl(),
          room,
          groupCall,
          participants: [...groupCall.participants],
        };
      });
      setRooms(items);
    }

    updateRooms();

    client.on(GroupCallEventHandlerEvent.Incoming, updateRooms);
    client.on(GroupCallEventHandlerEvent.Participants, updateRooms);

    return () => {
      client.removeListener(GroupCallEventHandlerEvent.Incoming, updateRooms);
      client.removeListener(
        GroupCallEventHandlerEvent.Participants,
        updateRooms
      );
    };
  }, [client]);

  return rooms;
}

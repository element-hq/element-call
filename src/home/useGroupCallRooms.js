import { useState, useEffect } from "react";

const tsCache = {};

function getLastTs(client, r) {
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

function sortRooms(client, rooms) {
  return rooms.sort((a, b) => {
    return getLastTs(client, b) - getLastTs(client, a);
  });
}

export function useGroupCallRooms(client) {
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
          avatarUrl: null,
          room,
          groupCall,
          participants: [...groupCall.participants],
        };
      });
      setRooms(items);
    }

    updateRooms();

    client.on("GroupCall.incoming", updateRooms);
    client.on("GroupCall.participants", updateRooms);

    return () => {
      client.removeListener("GroupCall.incoming", updateRooms);
      client.removeListener("GroupCall.participants", updateRooms);
    };
  }, [client]);

  return rooms;
}

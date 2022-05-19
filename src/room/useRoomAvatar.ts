import { useState, useEffect } from "react";
import { MatrixEvent } from "matrix-js-sdk/src/models/event";
import { Room } from "matrix-js-sdk/src/models/room";
import { RoomStateEvent } from "matrix-js-sdk/src/models/room-state";
import { EventType } from "matrix-js-sdk/src/@types/event";

export const useRoomAvatar = (room: Room) => {
  const [avatarUrl, setAvatarUrl] = useState(room.getMxcAvatarUrl());

  useEffect(() => {
    const update = (ev: MatrixEvent) => {
      if (ev.getType() === EventType.RoomAvatar) {
        setAvatarUrl(room.getMxcAvatarUrl());
      }
    };

    room.currentState.on(RoomStateEvent.Events, update);
    return () => {
      room.currentState.off(RoomStateEvent.Events, update);
    };
  }, [room]);

  return avatarUrl;
};

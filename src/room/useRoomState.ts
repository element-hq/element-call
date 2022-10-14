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

import { RoomState, RoomStateEvent } from "matrix-js-sdk/src/models/room-state";
import { useCallback, useMemo, useState } from "react";

import type { Room } from "matrix-js-sdk/src/models/room";
import { useTypedEventEmitter } from "../useEvents";

/**
 * A React hook for values computed from room state.
 * @param room The room.
 * @param f A mapping from the current room state to the computed value.
 * @returns The computed value.
 */
export const useRoomState = <T>(room: Room, f: (state: RoomState) => T): T => {
  const [numUpdates, setNumUpdates] = useState(0);
  useTypedEventEmitter(
    room,
    RoomStateEvent.Update,
    useCallback(() => setNumUpdates((n) => n + 1), [setNumUpdates])
  );
  // We want any change to the update counter to trigger an update here
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => f(room.currentState), [room, f, numUpdates]);
};

export const useRoomAvatar = (room: Room) =>
  useRoomState(
    room,
    useCallback(() => room.getMxcAvatarUrl(), [room])
  );

export const useJoinRule = (room: Room) =>
  useRoomState(
    room,
    useCallback((state) => state.getJoinRule(), [])
  );

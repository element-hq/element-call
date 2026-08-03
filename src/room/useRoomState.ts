/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useCallback } from "react";
import {
  type RoomState,
  RoomStateEvent,
  type Room,
  RoomEvent,
} from "matrix-js-sdk";

import { useTypedEventEmitterState } from "../useEvents";

/**
 * A React hook for values computed from room state.
 * @param room The room.
 * @param f A mapping from the current room state to the computed value.
 * @returns The computed value.
 */
export function useRoomState<T>(room: Room, f: (state: RoomState) => T): T {
  // TODO: matrix-js-sdk says that Room.currentState is deprecated, but it's not
  // clear how to reactively track the current state of the room without it
  const currentState = useTypedEventEmitterState(
    room,
    RoomEvent.CurrentStateUpdated,
    useCallback(() => room.currentState, [room]),
  );
  return useTypedEventEmitterState(
    currentState,
    RoomStateEvent.Update,
    useCallback(() => f(currentState), [f, currentState]),
  );
}

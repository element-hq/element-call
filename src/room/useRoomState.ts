/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
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
    useCallback(() => setNumUpdates((n) => n + 1), [setNumUpdates]),
  );
  // We want any change to the update counter to trigger an update here
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => f(room.currentState), [room, f, numUpdates]);
};

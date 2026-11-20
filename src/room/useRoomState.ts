/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useCallback, useSyncExternalStore } from "react";
import { RoomStateEvent, type Room, RoomEvent } from "matrix-js-sdk";

/**
 * A React hook for values computed from room state.
 * @param room The room.
 * @param f Reads the computed value off the room.
 * @returns The computed value.
 */
export function useRoomState<T>(room: Pick<Room, "on" | "off">, f: () => T): T {
  const subscribe = useCallback(
    (onChange: () => void) => {
      // The room re-emits the updates of whichever state is current, and says
      // when that state is replaced
      room.on(RoomStateEvent.Update, onChange);
      room.on(RoomEvent.CurrentStateUpdated, onChange);
      return (): void => {
        room.off(RoomStateEvent.Update, onChange);
        room.off(RoomEvent.CurrentStateUpdated, onChange);
      };
    },
    [room],
  );
  return useSyncExternalStore(subscribe, f);
}

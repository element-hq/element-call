/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Room, RoomEvent } from "matrix-js-sdk";
import { useCallback, useSyncExternalStore } from "react";

/**
 * The room's name, kept up to date. Null when there is no room yet, for a
 * caller that only sometimes has one.
 */
export function useRoomName(room: Room): string;
export function useRoomName(room: Room | null): string | null;
export function useRoomName(room: Room | null): string | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (room === null) return (): void => {};
      room.on(RoomEvent.Name, onChange);
      return (): void => {
        room.off(RoomEvent.Name, onChange);
      };
    },
    [room],
  );
  return useSyncExternalStore(
    subscribe,
    useCallback(() => room?.name ?? null, [room]),
  );
}

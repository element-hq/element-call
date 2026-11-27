/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useCallback, useSyncExternalStore } from "react";
import { type Room, RoomEvent, RoomStateEvent } from "matrix-js-sdk";
import { fromEvent, merge } from "rxjs";

export function useRoomAvatar(
  room: Pick<Room, "getMxcAvatarUrl" | "on" | "off">,
): string | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const s = merge(
        fromEvent(room, RoomStateEvent.Update),
        fromEvent(room, RoomEvent.CurrentStateUpdated),
      ).subscribe(onChange);
      return (): void => s.unsubscribe();
    },
    [room],
  );
  return useSyncExternalStore(subscribe, () => room.getMxcAvatarUrl());
}

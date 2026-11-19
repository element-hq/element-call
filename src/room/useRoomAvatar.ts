/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useCallback } from "react";
import { type Room } from "matrix-js-sdk";

import { useRoomState } from "./useRoomState";

export function useRoomAvatar(
  room: Pick<
    Room,
    // The avatar itself
    | "getMxcAvatarUrl"
    // Room state, and `on`/`off` for `RoomEvent.CurrentStateUpdated`, for
    // `useRoomState`
    | "currentState"
    | "on"
    | "off"
  >,
): string | null {
  return useRoomState(
    room,
    useCallback(() => room.getMxcAvatarUrl(), [room]),
  );
}

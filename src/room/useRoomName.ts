/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Room, RoomEvent } from "matrix-js-sdk";
import { useCallback } from "react";

import { useTypedEventEmitterState } from "../useEvents";

export function useRoomName(room: Room): string {
  return useTypedEventEmitterState(
    room,
    RoomEvent.Name,
    useCallback(() => room.name, [room]),
  );
}

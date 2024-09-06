/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { Room, RoomEvent } from "matrix-js-sdk/src/matrix";
import { useState } from "react";

import { useTypedEventEmitter } from "../useEvents";

export function useRoomName(room: Room): string {
  const [, setNumUpdates] = useState(0);
  // Whenever the name changes, force an update
  useTypedEventEmitter(room, RoomEvent.Name, () => setNumUpdates((n) => n + 1));
  return room.name;
}

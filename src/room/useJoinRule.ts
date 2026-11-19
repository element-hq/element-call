/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useCallback } from "react";

import type { JoinRule } from "matrix-js-sdk";
import { type RoomStateParts, useRoomState } from "./useRoomState";

export function useJoinRule(room: RoomStateParts): JoinRule {
  return useRoomState(
    room,
    useCallback((state) => state.getJoinRule(), []),
  );
}

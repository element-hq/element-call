/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { useCallback } from "react";
import { JoinRule } from "matrix-js-sdk/src/matrix";

import type { Room } from "matrix-js-sdk/src/models/room";
import { useRoomState } from "./useRoomState";

export function useJoinRule(room: Room): JoinRule {
  return useRoomState(
    room,
    useCallback((state) => state.getJoinRule(), []),
  );
}

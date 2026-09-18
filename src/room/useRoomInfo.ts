/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect, useState } from "react";

import {
  type RoomDriver,
  type RoomInfo,
} from "../driver/ElementCallMatrixClientDriver";
import { useMatrixDrivers } from "../driver/MatrixDriverContext";

/**
 * The room's name, alias, avatar, join rule, encryption and whether we may
 * open its slot, from the given room driver, kept current.
 */
export function useRoomInfoFrom(room: RoomDriver): RoomInfo {
  const [info, setInfo] = useState(() => room.getRoomInfo());
  useEffect(() => {
    setInfo(room.getRoomInfo());
    return room.subscribeRoomInfo(setInfo);
  }, [room]);
  return info;
}

/**
 * {@link useRoomInfoFrom} for the call's room: the client driver the host
 * provided. Replaces `useRoomName`, `useRoomAvatar` and `useJoinRule` under
 * `CallView`.
 */
export function useRoomInfo(): RoomInfo {
  return useRoomInfoFrom(useMatrixDrivers().clientDriver);
}

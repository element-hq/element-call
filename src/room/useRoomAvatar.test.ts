/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { RoomEvent, type RoomState } from "matrix-js-sdk";

import { mockMatrixRoom } from "../utils/test";
import { useRoomAvatar } from "./useRoomAvatar";

// The hook reads the room, not the state the events carry
const state = {} as RoomState;

test("the avatar follows the room's state being replaced", () => {
  let avatar: string | null = null;
  const room = mockMatrixRoom({ getMxcAvatarUrl: () => avatar });
  const { result } = renderHook(() => useRoomAvatar(room));
  expect(result.current).toBeNull();

  avatar = "mxc://example.org/avatar";
  act(() => void room.emit(RoomEvent.CurrentStateUpdated, room, state, state));
  expect(result.current).toBe("mxc://example.org/avatar");
});

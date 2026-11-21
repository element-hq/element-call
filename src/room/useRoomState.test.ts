/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  JoinRule,
  RoomEvent,
  type RoomState,
  RoomStateEvent,
} from "matrix-js-sdk";

import { mockMatrixRoom } from "../utils/test";
import { useJoinRule } from "./useJoinRule";
import { useRoomAvatar } from "./useRoomAvatar";

// The hooks read the room, not the state the events carry
const state = {} as RoomState;

test("the join rule follows the room's state updates", () => {
  let joinRule = JoinRule.Invite;
  const room = mockMatrixRoom({ getJoinRule: () => joinRule });
  const { result } = renderHook(() => useJoinRule(room));
  expect(result.current).toBe(JoinRule.Invite);

  joinRule = JoinRule.Public;
  act(() => void room.emit(RoomStateEvent.Update, state));
  expect(result.current).toBe(JoinRule.Public);
});

test("the avatar follows the room's state being replaced", () => {
  let avatar: string | null = null;
  const room = mockMatrixRoom({ getMxcAvatarUrl: () => avatar });
  const { result } = renderHook(() => useRoomAvatar(room));
  expect(result.current).toBeNull();

  avatar = "mxc://example.org/avatar";
  act(() => void room.emit(RoomEvent.CurrentStateUpdated, room, state, state));
  expect(result.current).toBe("mxc://example.org/avatar");
});

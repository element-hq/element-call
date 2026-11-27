/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { JoinRule, type RoomState, RoomStateEvent } from "matrix-js-sdk";

import { mockMatrixRoom } from "../utils/test";
import { useJoinRule } from "./useJoinRule";

// The hook reads the room, not the state the events carry
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

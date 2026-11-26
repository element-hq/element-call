/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  JoinRule,
  type MatrixClient,
  type Room,
  SyncState,
} from "matrix-js-sdk";
import { type MatrixRTCSession } from "matrix-js-sdk/lib/matrixrtc";

import { mockEmitter, mockMatrixRoom } from "../utils/test";
import { type GroupCallLoaded, useLoadGroupCall } from "./useLoadGroupCall";

test("a joined room is the client's own, not the detached one joinRoom returns", async () => {
  const roomId = "!call:example.org";
  const detachedRoom = mockMatrixRoom({ roomId });
  const syncedRoom = mockMatrixRoom({ roomId });
  const rtcSession = {} as MatrixRTCSession;
  // Unknown before the join, known once the sync has brought it in
  let knownRoom: Room | null = null;
  const getRoomSession = vi.fn().mockReturnValue(rtcSession);
  const client = {
    ...mockEmitter(),
    getSyncState: () => SyncState.Syncing,
    getRoom: () => knownRoom,
    getRoomSummary: vi.fn().mockResolvedValue({ join_rule: JoinRule.Public }),
    joinRoom: vi.fn().mockResolvedValue(detachedRoom),
    waitUntilRoomReadyForGroupCalls: vi.fn().mockImplementation(async () => {
      knownRoom = syncedRoom;
      return Promise.resolve();
    }),
    matrixRTC: { getRoomSession },
  } as unknown as MatrixClient;

  const { result } = renderHook(() => useLoadGroupCall(client, roomId, []));

  await waitFor(() => expect(result.current.kind).toBe("loaded"));
  const loaded = result.current as GroupCallLoaded;
  expect(loaded.room).toBe(syncedRoom);
  expect(loaded.rtcSession).toBe(rtcSession);
  expect(getRoomSession).toHaveBeenCalledWith(syncedRoom);
});

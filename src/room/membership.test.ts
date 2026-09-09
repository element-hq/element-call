/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";
import {
  KnownMembership,
  MatrixError,
  type MatrixClient,
  type Membership,
} from "matrix-js-sdk";

import { mockMatrixRoom } from "../utils/test";
import { changeMembershipWithClient } from "./membership";

const roomId = "!call:example.org";
const viaServers = ["example.org"];

const mockClient = (membership?: Membership): MatrixClient => {
  const room =
    membership === undefined
      ? null
      : mockMatrixRoom({ roomId, getMyMembership: () => membership });
  return {
    getRoom: vi.fn().mockReturnValue(room),
    joinRoom: vi.fn().mockResolvedValue(room),
    knockRoom: vi.fn().mockResolvedValue({ room_id: roomId }),
    leave: vi.fn().mockResolvedValue({}),
  } as Partial<MatrixClient> as MatrixClient;
};

const change = (
  client: MatrixClient,
): ReturnType<typeof changeMembershipWithClient> =>
  changeMembershipWithClient(client, roomId, viaServers);

describe("changeMembershipWithClient", () => {
  it("joins with the servers to try", async () => {
    const client = mockClient(KnownMembership.Leave);
    await expect(change(client)({ action: "join" })).resolves.toBe(
      KnownMembership.Join,
    );
    expect(client.joinRoom).toHaveBeenCalledWith(roomId, { viaServers });
  });

  it("knocks with the reason and the servers to try", async () => {
    const client = mockClient(KnownMembership.Knock);
    await expect(
      change(client)({ action: "knock", reason: "let me in" }),
    ).resolves.toBe(KnownMembership.Knock);
    expect(client.knockRoom).toHaveBeenCalledWith(roomId, {
      viaServers,
      reason: "let me in",
    });
  });

  it("reports a knock the room state has yet to catch up with", async () => {
    // A user who withdrew a request and asked again is still `leave` locally
    await expect(
      change(mockClient(KnownMembership.Leave))({ action: "knock" }),
    ).resolves.toBe(KnownMembership.Knock);
  });

  it("withdraws a request by leaving", async () => {
    const client = mockClient(KnownMembership.Knock);
    await expect(change(client)({ action: "cancel_knock" })).resolves.toBe(
      KnownMembership.Leave,
    );
    expect(client.leave).toHaveBeenCalledWith(roomId);
  });

  it("retries a join the server has yet to see the invite for", async () => {
    vi.useFakeTimers();
    try {
      const client = mockClient(KnownMembership.Invite);
      const joinRoom = vi
        .spyOn(client, "joinRoom")
        .mockRejectedValueOnce(
          new MatrixError({ errcode: "M_FORBIDDEN", error: "Not invited" }),
        )
        .mockResolvedValueOnce(client.getRoom(roomId)!);

      const joined = change(client)({ action: "join" });
      await vi.runAllTimersAsync();

      await expect(joined).resolves.toBe(KnownMembership.Join);
      expect(joinRoom).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

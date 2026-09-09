/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  KnownMembership,
  MatrixError,
  type MatrixClient,
  type Membership,
} from "matrix-js-sdk";

/** A change to the local user's membership of the room the call is in. */
export type MembershipChange =
  | { action: "join" }
  | { action: "knock"; reason?: string }
  /** Withdraws a request to join. */
  | { action: "cancel_knock" };

/**
 * Applies a membership change, resolving to the membership it resulted in.
 */
export type ChangeMembership = (
  change: MembershipChange,
) => Promise<Membership>;

/**
 * The host has no implementation of the requested membership change, so there
 * is no point in offering it again.
 */
export class MembershipUnsupportedError extends Error {}

const MAX_ATTEMPTS_FOR_INVITE_JOIN_FAILURE = 3;
const DELAY_MS_FOR_INVITE_JOIN_FAILURE = 3000;

/**
 * Joins a room the user has been invited to, retrying on M_FORBIDDEN: a
 * homeserver that has not yet caught up with an invite from another server
 * refuses the join.
 *
 * @see https://github.com/element-hq/element-call/issues/2634
 */
async function joinRoomAfterInvite(
  client: MatrixClient,
  roomId: string,
  viaServers: string[],
  attempt = 1,
): Promise<void> {
  try {
    await client.joinRoom(roomId, { viaServers });
  } catch (error) {
    if (
      error instanceof MatrixError &&
      error.errcode === "M_FORBIDDEN" &&
      attempt < MAX_ATTEMPTS_FOR_INVITE_JOIN_FAILURE
    ) {
      await new Promise((r) => setTimeout(r, DELAY_MS_FOR_INVITE_JOIN_FAILURE));
      await joinRoomAfterInvite(client, roomId, viaServers, attempt + 1);
    } else {
      throw error;
    }
  }
}

/**
 * Changes the membership over the client-server API, with Element Call's own
 * access token.
 */
export function changeMembershipWithClient(
  client: MatrixClient,
  roomId: string,
  viaServers: string[],
): ChangeMembership {
  return async (change) => {
    // A request the server accepted decides the membership: the local room
    // state still holds the previous one until the next sync brings the new
    // member event, so reading it back here would report the old membership.
    switch (change.action) {
      case "join":
        if (
          client.getRoom(roomId)?.getMyMembership() === KnownMembership.Invite
        )
          await joinRoomAfterInvite(client, roomId, viaServers);
        else await client.joinRoom(roomId, { viaServers });
        return KnownMembership.Join;
      case "knock":
        await client.knockRoom(roomId, { viaServers, reason: change.reason });
        return KnownMembership.Knock;
      case "cancel_knock":
        await client.leave(roomId);
        return KnownMembership.Leave;
    }
  };
}

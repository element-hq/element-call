/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixClient } from "matrix-js-sdk";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";

import { extractFullConfigFromToken, type SFUConfig } from "./types.ts";
import { doNetworkOperationWithRetry } from "../../utils/matrix.ts";

// TODO: This should come from the `MatrixRTCSession`s slot description instead
// of being hardcoded here. (the legacy flow hardcodes it as well)
const SLOT_ID = "m.call#ROOM";

export type ClientGetTokenParts = Pick<
  MatrixClient,
  "_unstable_getLivekitToken"
>;

export interface GetSFUConfigParams {
  /**
   * The Matrix client.
   */
  client: ClientGetTokenParts;
  /**
   * Data identifying the local user's session membership.
   */
  membership: CallMembershipIdentityParts;
  /**
   * The WebSocket URL of the SFU for which we wish to get an access token.
   */
  url: string;
  /**
   * The ID of the Matrix room in which the session takes place.
   */
  roomId: string;
}

/**
 * Gets an {@link SFUConfig} appropriate for connecting to a given SFU, using
 * the MSC4195 LiveKit client-server API endpoints.
 */
export async function getSFUConfig({
  client,
  membership,
  url,
  roomId,
}: GetSFUConfigParams): Promise<SFUConfig> {
  const res = await doNetworkOperationWithRetry(async () =>
    client._unstable_getLivekitToken({
      url,
      room_id: roomId,
      slot_id: "m.call#ROOM",
      member_id: membership.memberId,
    }),
  );
  return extractFullConfigFromToken({ url, jwt: res.jwt });
}

export type ClientDelegationParts = Pick<
  MatrixClient,
  "_unstable_delegateDelayedLeave" | "baseUrl"
>;

export interface DelegateDelayedLeaveParams {
  /**
   * The Matrix client.
   */
  client: ClientDelegationParts;
  /**
   * Data identifying the local user's session membership.
   */
  membership: CallMembershipIdentityParts;
  /**
   * The WebSocket URL of the SFU to which we are publishing and wish to
   * delegate the delayed leave event.
   */
  url: string;
  /**
   * The ID of the room in which the session takes place.
   */
  roomId: string;
  /**
   * The delay ID of the leave event to be delegated.
   */
  delayId: string;
}

/**
 * Delegates a delayed leave event to a given SFU, so that the event will
 * be sent on our behalf whenever we disconnect from the SFU.
 */
export async function delegateDelayedLeave({
  client,
  membership,
  url,
  roomId,
  delayId,
}: DelegateDelayedLeaveParams): Promise<void> {
  await doNetworkOperationWithRetry(async () =>
    client._unstable_delegateDelayedLeave({
      url,
      room_id: roomId,
      slot_id: SLOT_ID,
      member_id: membership.memberId,
      delay_id: delayId,
    }),
  );
}

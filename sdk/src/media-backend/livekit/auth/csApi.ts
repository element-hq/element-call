/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { ConnectionError, HTTPError, type MatrixClient } from "matrix-js-sdk";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";

import { doNetworkOperationWithRetry } from "../../../utils/network";
import { extractFullConfigFromToken, type SFUConfig } from "./types";

/**
 * In widget mode the host may refuse an action before any request is made,
 * which surfaces as a plain error. Asking again cannot change its answer, so
 * only errors from the network are worth retrying.
 */
function isNetworkError(e: unknown): boolean {
  return e instanceof HTTPError || e instanceof ConnectionError;
}

export type ClientGetTokenParts = Pick<
  MatrixClient,
  "_unstable_getLivekitToken"
>;

export interface GetSFUConfigParams {
  client: ClientGetTokenParts;
  /** Our own membership identity; the member id is what the token is issued for. */
  membership: CallMembershipIdentityParts;
  /** The WebSocket URL of the SFU to get a token for. */
  url: string;
  /** The homeserver the SFU belongs to. */
  serverName: string;
  roomId: string;
  slotId: string;
}

/** Gets an SFU token through the homeserver's MSC4195 `get_token` endpoint. */
export async function getSFUConfig({
  client,
  membership,
  url,
  serverName,
  roomId,
  slotId,
}: GetSFUConfigParams): Promise<SFUConfig> {
  const res = await doNetworkOperationWithRetry(
    async () =>
      client._unstable_getLivekitToken({
        url,
        server_name: serverName,
        room_id: roomId,
        slot_id: slotId,
        member_id: membership.memberId,
      }),
    isNetworkError,
  );
  return extractFullConfigFromToken({ url, jwt: res.jwt });
}

export type ClientDelegationParts = Pick<
  MatrixClient,
  "_unstable_delegateDelayedLeave" | "baseUrl"
>;

export interface DelegateDelayedLeaveParams {
  client: ClientDelegationParts;
  membership: CallMembershipIdentityParts;
  /** The WebSocket URL of the SFU we publish on. */
  url: string;
  roomId: string;
  slotId: string;
  /** The delay ID of the leave event to hand over. */
  delayId: string;
}

/**
 * Hands the delayed leave to the homeserver through the MSC4195
 * `delegate_delayed_leave` endpoint, which sends it once we drop off the SFU.
 */
export async function delegateDelayedLeave({
  client,
  membership,
  url,
  roomId,
  slotId,
  delayId,
}: DelegateDelayedLeaveParams): Promise<void> {
  await doNetworkOperationWithRetry(
    async () =>
      client._unstable_delegateDelayedLeave({
        url,
        room_id: roomId,
        slot_id: slotId,
        member_id: membership.memberId,
        delay_id: delayId,
      }),
    isNetworkError,
  );
}

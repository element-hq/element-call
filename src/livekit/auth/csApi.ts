/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { ConnectionError, HTTPError, type MatrixClient } from "matrix-js-sdk";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";

import { extractFullConfigFromToken, type SFUConfig } from "./types.ts";
import { doNetworkOperationWithRetry } from "../../utils/matrix.ts";

/**
 * In widget mode the host may refuse an action before any request is made
 * which surfaces as a plain error. Asking again cannot change its answer,
 * so only errors from the network are worth retrying.
 */
function isNetworkError(e: unknown): boolean {
  return e instanceof HTTPError || e instanceof ConnectionError;
}

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
   * The name of the homeserver to which the SFU belongs.
   */
  serverName: string;
  /**
   * The ID of the Matrix room in which the session takes place.
   */
  roomId: string;
  /**
   * The ID of the MatrixRTC slot in which the session takes place.
   */
  slotId: string;
}

/**
 * Gets an {@link SFUConfig} appropriate for connecting to a given SFU, using
 * the MSC4195 LiveKit client-server API endpoints.
 */
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
   * The ID of the Matrix room in which the session takes place.
   */
  roomId: string;
  /**
   * The ID of the MatrixRTC slot in which the session takes place.
   */
  slotId: string;
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

/*
Copyright 2023, 2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type IOpenIDToken,
  type MatrixClient,
  parseErrorResponse,
} from "matrix-js-sdk";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";
import { type Logger } from "matrix-js-sdk/lib/logger";

import { FailToGetOpenIdToken } from "../../../errors";
import { doNetworkOperationWithRetry } from "../../../utils/network";
import {
  type ConnectionRole,
  extractFullConfigFromToken,
  type SFUConfig,
} from "./types";

export type ClientOpenIDParts = Pick<MatrixClient, "getOpenIdToken">;

export interface GetSFUConfigParams {
  client: ClientOpenIDParts;
  /** Our own membership identity, as the JWT service wants it. */
  membership: CallMembershipIdentityParts;
  /** The base URL of the LiveKit JWT service. */
  serviceUrl: string;
  /** The Matrix room the session is in; the JWT service maps it to a LiveKit room. */
  roomId: string;
  /** The MatrixRTC slot the session is in, e.g. `m.call#ROOM`. */
  slotId: string;
  role: ConnectionRole;
  /** The base URL of the Matrix homeserver, for delayed leave delegation. */
  delayEndpointBaseUrl?: string;
  /** The delay ID of the leave event to delegate to the JWT service. */
  delayId?: string;
  /** How long the SFU waits before sending the delegated leave. Needed with `delayId`. */
  delayTimeoutMs?: number;
  logger: Logger;
}

/**
 * Authenticates with a LiveKit JWT service through the OpenID flow: an OpenID
 * token from the homeserver, exchanged at the service for an SFU token.
 *
 * A publisher uses the legacy `/sfu/get` endpoint, the only one that assigns
 * the `<user_id>:<device_id>` identity that clients predating MSC4195 match a
 * membership against. A subscriber uses the `/get_token` endpoint, which
 * hashes the identity: nobody matches a subscriber.
 * @throws {@link FailToGetOpenIdToken}
 */
export async function getSFUConfig({
  client,
  membership,
  serviceUrl,
  roomId,
  slotId,
  role,
  delayEndpointBaseUrl,
  delayId,
  delayTimeoutMs,
  logger,
}: GetSFUConfigParams): Promise<SFUConfig> {
  let openIdToken: IOpenIDToken;
  try {
    openIdToken = await doNetworkOperationWithRetry(async () =>
      client.getOpenIdToken(),
    );
  } catch (error) {
    throw new FailToGetOpenIdToken(
      error instanceof Error ? error : new Error("Unknown error"),
    );
  }
  logger.debug("Got openID token", openIdToken);

  const delay: DelayParams =
    // Also check for empty string
    delayId && delayEndpointBaseUrl
      ? {
          delay_id: delayId,
          delay_timeout: delayTimeoutMs,
          delay_cs_api_url: delayEndpointBaseUrl,
        }
      : {};
  const endpoint = role === "publisher" ? "legacy" : "default";
  try {
    logger.info(
      `Trying to get JWT with ${endpoint} endpoint for focus ${serviceUrl}...`,
    );
    const sfuConfig = await (
      endpoint === "legacy" ? getLiveKitJWTLegacy : getLiveKitJWT
    )(membership, serviceUrl, roomId, slotId, openIdToken, delay);
    logger.info(`Got JWT from call's active focus URL.`);
    return extractFullConfigFromToken(sfuConfig);
  } catch (e) {
    logger.error(`Failed fetching jwt with ${endpoint} endpoint:`, e);
    throw new FailToGetOpenIdToken(
      e instanceof Error ? e : new Error(`Unknown error ${e}`),
    );
  }
}

interface DelayParams {
  delay_id?: string;
  delay_timeout?: number;
  delay_cs_api_url?: string;
}

/** The legacy `/sfu/get` endpoint, which assigns the `<user_id>:<device_id>` identity. */
async function getLiveKitJWTLegacy(
  membership: CallMembershipIdentityParts,
  livekitServiceURL: string,
  matrixRoomId: string,
  _slotId: string, // The legacy endpoint predates slots
  openIDToken: IOpenIDToken,
  delay: DelayParams,
): Promise<{ url: string; jwt: string }> {
  const makeRequest = async (delayParts: DelayParams): Promise<Response> =>
    await fetch(livekitServiceURL + "/sfu/get", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // The legacy JWT endpoint uses only the matrix room id to calculate
        // the livekit room alias, which comes back in the JWT payload
        room: matrixRoomId,
        openid_token: openIDToken,
        device_id: membership.deviceId,
        ...delayParts,
      }),
    });

  const res = await doNetworkOperationWithRetry(async () => {
    let response = await makeRequest(delay);
    // A service from before delegation rejects the delay fields as bad JSON;
    // it still issues a token without them
    if (response.status === 400 && Object.keys(delay).length > 0) {
      try {
        const errorBody = await response.json();
        if (errorBody.errcode === "M_BAD_JSON")
          response = await makeRequest({});
      } catch {
        // Not a JSON error body, so a real error
      }
    }
    return response;
  });

  if (!res.ok) throw parseErrorResponse(res, await res.text());
  return await res.json();
}

class NotSupportedError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "NotSupported";
  }
}

/** The `/get_token` endpoint, which assigns a hashed identity. */
async function getLiveKitJWT(
  membership: CallMembershipIdentityParts,
  livekitServiceURL: string,
  matrixRoomId: string,
  slotId: string,
  openIDToken: IOpenIDToken,
  delay: DelayParams,
): Promise<{ url: string; jwt: string }> {
  const { userId, deviceId, memberId } = membership;
  const res = await doNetworkOperationWithRetry(
    async () =>
      await fetch(livekitServiceURL + "/get_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          room_id: matrixRoomId,
          slot_id: slotId,
          openid_token: openIDToken,
          member: {
            id: memberId,
            claimed_user_id: userId,
            claimed_device_id: deviceId,
          },
          ...delay,
        }),
      }),
  );

  if (!res.ok) {
    const msg = "SFU Config fetch failed with status code " + res.status;
    if (res.status === 404) throw new NotSupportedError(msg);
    throw parseErrorResponse(res, await res.text());
  }
  return await res.json();
}

/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type IOpenIDToken, type MatrixClient } from "matrix-js-sdk";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";
import { type Logger } from "matrix-js-sdk/lib/logger";

import { FailToGetOpenIdToken } from "../utils/errors";
import { doNetworkOperationWithRetry } from "../utils/matrix";
import { Config } from "../config/Config";

export interface SFUConfig {
  url: string;
  jwt: string;
}

// The bits we need from MatrixClient
export type OpenIDClientParts = Pick<
  MatrixClient,
  "getOpenIdToken" | "getDeviceId"
>;
/**
 * Gets a bearer token from the homeserver and then use it to authenticate
 * to the matrix RTC backend in order to get acces to the SFU.
 * It has built-in retry for calls to the homeserver with a backoff policy.
 * @param client
 * @param membership
 * @param serviceUrl
 * @param forceOldEndpoint This will use the old jwt endpoint which will create the rtc backend identity based on string concatination
 * instead of a hash.
 * This function by default uses whatever is possible with the current jwt service installed next to the SFU.
 * For remote connections this does not matter, since we will not publish there we can rely on the newest option.
 * For our own connection we can only use the hashed version if we also send the new matrix2.0 sticky events.
 * @param livekitRoomAlias
 * @param delayEndpointBaseUrl
 * @param delayId
 * @param logger
 * @returns Object containing the token information
 * @throws FailToGetOpenIdToken
 */
export async function getSFUConfigWithOpenID(
  client: OpenIDClientParts,
  membership: CallMembershipIdentityParts,
  serviceUrl: string,
  forceOldJwtEndpoint: boolean,
  livekitRoomAlias: string,
  delayEndpointBaseUrl?: string,
  delayId?: string,
  logger?: Logger,
): Promise<SFUConfig> {
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
  logger?.debug("Got openID token", openIdToken);

  logger?.info(`Trying to get JWT for focus ${serviceUrl}...`);
  const args: [CallMembershipIdentityParts, string, string, IOpenIDToken] = [
    membership,
    serviceUrl,
    livekitRoomAlias,
    openIdToken,
  ];
  try {
    // we do not want to try the old endpoint, since we are not sending the new matrix2.0 sticky events (no hashed identity in the event)
    if (forceOldJwtEndpoint) throw new Error("Force old jwt endpoint");
    if (!delayId)
      throw new Error("No delayId, Won't try matrix 2.0 jwt endpoint.");

    const sfuConfig = await getLiveKitJWTWithDelayDelegation(
      ...args,
      delayEndpointBaseUrl,
      delayId,
    );
    logger?.info(`Got JWT from call's active focus URL.`);
    return sfuConfig;
  } catch (e) {
    logger?.warn(
      `Failed fetching jwt with matrix 2.0 endpoint (retry with legacy)`,
      e,
    );
    const sfuConfig = await getLiveKitJWT(...args);
    logger?.info(`Got JWT from call's active focus URL.`);
    return sfuConfig;
  }
}

async function getLiveKitJWT(
  membership: CallMembershipIdentityParts,
  livekitServiceURL: string,
  livekitRoomAlias: string,
  openIDToken: IOpenIDToken,
): Promise<SFUConfig> {
  try {
    const res = await fetch(livekitServiceURL + "/sfu/get", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        room: livekitRoomAlias,
        openid_token: openIDToken,
        device_id: membership.deviceId,
      }),
    });
    if (!res.ok) {
      throw new Error("SFU Config fetch failed with status code " + res.status);
    }
    return await res.json();
  } catch (e) {
    throw new Error("SFU Config fetch failed with exception " + e);
  }
}

export async function getLiveKitJWTWithDelayDelegation(
  membership: CallMembershipIdentityParts,
  livekitServiceURL: string,
  livekitRoomAlias: string,
  openIDToken: IOpenIDToken,
  delayEndpointBaseUrl?: string,
  delayId?: string,
): Promise<SFUConfig> {
  const { userId, deviceId, memberId } = membership;

  const body = {
    room_id: livekitRoomAlias,
    slot_id: "m.call#ROOM",
    openid_token: openIDToken,
    member: {
      id: memberId,
      claimed_user_id: userId,
      claimed_device_id: deviceId,
    },
  };

  let bodyDalayParts = {};
  // Also check for empty string
  if (delayId && delayEndpointBaseUrl) {
    const delayTimeoutMs =
      Config.get().matrix_rtc_session?.delayed_leave_event_delay_ms ?? 1000;
    bodyDalayParts = {
      delay_id: delayId,
      delay_timeout: delayTimeoutMs,
      delay_cs_api_url: delayEndpointBaseUrl,
    };
  }

  try {
    const res = await fetch(livekitServiceURL + "/get_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...body, ...bodyDalayParts }),
    });
    if (!res.ok) {
      throw new Error("SFU Config fetch failed with status code " + res.status);
    }
    return await res.json();
  } catch (e) {
    throw new Error("SFU Config fetch failed with exception " + e);
  }
}

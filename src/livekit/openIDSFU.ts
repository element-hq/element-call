/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type IOpenIDToken, type MatrixClient } from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/lib/logger";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";

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
 * @param serviceUrl
 * @param matrixRoomId
 * @returns Object containing the token information
 * @throws FailToGetOpenIdToken
 */
export async function getSFUConfigWithOpenID(
  client: OpenIDClientParts,
  membership: CallMembershipIdentityParts,
  serviceUrl: string,
  livekitRoomAlias: string,
  matrix2jwt: boolean,
  delayEndpointBaseUrl?: string,
  delayId?: string,
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
  logger.debug("Got openID token", openIdToken);

  logger.info(`Trying to get JWT for focus ${serviceUrl}...`);
  const args: [CallMembershipIdentityParts, string, string, IOpenIDToken] = [
    membership,
    serviceUrl,
    livekitRoomAlias,
    openIdToken,
  ];
  if (matrix2jwt) {
    const sfuConfig = await getLiveKitJWTWithDelayDelegation(
      ...args,
      delayEndpointBaseUrl,
      delayId,
    );
    logger.info(`Got JWT from call's active focus URL.`);
    return sfuConfig;
  } else {
    const sfuConfig = await getLiveKitJWT(...args);
    logger.info(`Got JWT from call's active focus URL.`);
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

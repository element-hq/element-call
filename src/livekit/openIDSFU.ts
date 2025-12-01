/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type IOpenIDToken, type MatrixClient } from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/lib/logger";

import { FailToGetOpenIdToken } from "../utils/errors";
import { doNetworkOperationWithRetry } from "../utils/matrix";

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
  serviceUrl: string,
  matrixRoomId: string,
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
  const sfuConfig = await getLiveKitJWT(
    client,
    serviceUrl,
    matrixRoomId,
    openIdToken,
  );
  logger.info(`Got JWT from call's active focus URL.`);

  return sfuConfig;
}

async function getLiveKitJWT(
  client: OpenIDClientParts,
  livekitServiceURL: string,
  roomName: string,
  openIDToken: IOpenIDToken,
): Promise<SFUConfig> {
  try {
    const res = await fetch(livekitServiceURL + "/sfu/get", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        room: roomName,
        openid_token: openIDToken,
        device_id: client.getDeviceId(),
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

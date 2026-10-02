/*
Copyright 2023, 2024 New Vector Ltd.

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

import { FailToGetOpenIdToken } from "../../utils/errors";
import { doNetworkOperationWithRetry } from "../../utils/matrix";
import { Config } from "../../config/Config";
import { extractFullConfigFromToken, type SFUConfig } from "./types";

// The bits we need from MatrixClient
export type ClientOpenIDParts = Pick<
  MatrixClient,
  "getOpenIdToken" | "getDeviceId"
>;

/**
 * Gets a bearer token from the homeserver and then use it to authenticate
 * to the matrix RTC backend in order to get acces to the SFU.
 * It has built-in retry for calls to the homeserver with a backoff policy.
 * @param client The Matrix client
 * @param membership Our own membership identity parts used to send to jwt service.
 * @param serviceUrl The URL of the livekit SFU service
 * @param roomId The room id used in the jwt request. This is NOT the livekit_alias. The jwt service will provide the alias. It maps matrix room ids <-> Livekit aliases.
 * @param opts Additional options to modify which endpoint with which data will be used to acquire the jwt token.
 * @param opts.matrixRTCMode Determines which version of the JWT endpoint to use, which affects whether the
 * RTC backend identity is based on string concatenation (legacy) or a hash (Matrix 2.0).
 * This function by default uses whatever is possible with the current jwt service installed next to the SFU.
 * For remote connections this does not matter, since we will not publish there we can rely on the newest option.
 * @param opts.delayEndpointBaseUrl The URL of the matrix homeserver.
 * @param opts.delayId The delay id used for the jwt service to manage.
 * @param logger optional logger.
 * @returns Object containing the token information
 * @throws FailToGetOpenIdToken
 */
export async function getSFUConfig({
  client,
  membership,
  serviceUrl,
  roomId,
  role,
  delayEndpointBaseUrl,
  delayId,
  logger,
}: {
  client: ClientOpenIDParts;
  membership: CallMembershipIdentityParts;
  serviceUrl: string;
  roomId: string;
  role: "publisher" | "subscriber";
  delayEndpointBaseUrl?: string;
  delayId?: string;
  logger: Logger;
}): Promise<SFUConfig> {
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
  let sfuConfig: { url: string; jwt: string } | undefined;

  let endpoint: "default" | "legacy";
  switch (role) {
    case "publisher":
      // When publishing a legacy transport (one with a `livekit_service_url`),
      // subscribers will expect our participant identity to use the legacy
      // `@user_id:device_id` format. Only the legacy JWT service endpoint
      // assigns identities in this format, so we must use it.
      endpoint = "legacy";
      break;
    case "subscriber":
      // Use the default endpoint as it's more likely to allow remote access.
      endpoint = "default";
      break;
  }

  try {
    logger.info(
      `Trying to get JWT with ${endpoint} endpoint for focus ${serviceUrl}...`,
    );
    sfuConfig = await (
      endpoint === "legacy" ? getLiveKitJWTLegacy : getLiveKitJWT
    )(
      membership,
      serviceUrl,
      roomId,
      openIdToken,
      delayEndpointBaseUrl,
      delayId,
    );
    logger.info(`Got JWT from call's active focus URL.`);
    return extractFullConfigFromToken(sfuConfig);
  } catch (e) {
    logger.error(`Failed fetching jwt with ${endpoint} endpoint:`, e);
    throw new FailToGetOpenIdToken(
      e instanceof Error ? e : new Error(`Unknown error ${e}`),
    );
  }
}

async function getLiveKitJWTLegacy(
  membership: CallMembershipIdentityParts,
  livekitServiceURL: string,
  matrixRoomId: string,
  openIDToken: IOpenIDToken,
  delayEndpointBaseUrl?: string,
  delayId?: string,
): Promise<{ url: string; jwt: string }> {
  interface IDelayParams {
    delay_id?: string;
    delay_timeout?: number;
    delay_cs_api_url?: string;
  }
  let bodyDalayParts: IDelayParams = {};
  // Also check for empty string
  if (delayId && delayEndpointBaseUrl) {
    bodyDalayParts = {
      delay_id: delayId,
      delay_timeout:
        Config.get().matrix_rtc_session.delegated_delayed_leave.delay_ms,
      delay_cs_api_url: delayEndpointBaseUrl,
    };
  }

  const makeRequest = async (delayParts: IDelayParams): Promise<Response> => {
    return await fetch(livekitServiceURL + "/sfu/get", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // The legacy JWT endpoint uses only the matrix room id to calculate the livekit room alias.
        // However, the livekit room alias is provided as part of the JWT payload.
        room: matrixRoomId,
        openid_token: openIDToken,
        device_id: membership.deviceId,
        ...delayParts,
      }),
    });
  };

  const res = await doNetworkOperationWithRetry(async () => {
    let response = await makeRequest(bodyDalayParts);

    // Old service compatibility check
    const oldServiceDoesNotSupportDelayParts =
      response.status === 400 && Object.keys(bodyDalayParts).length > 0;
    // If http status 400 with M_BAD_JSON and we sent delay parts, retry without them
    if (oldServiceDoesNotSupportDelayParts) {
      try {
        const errorBody = await response.json();
        if (errorBody.errcode === "M_BAD_JSON") {
          response = await makeRequest({});
        }
      } catch {
        // If we can't parse the error, treat as real error
      }
    }

    return response;
  });

  if (!res.ok) {
    throw parseErrorResponse(res, await res.text());
  }
  return await res.json();
}

class NotSupportedError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "NotSupported";
  }
}

async function getLiveKitJWT(
  membership: CallMembershipIdentityParts,
  livekitServiceURL: string,
  matrixRoomId: string,
  openIDToken: IOpenIDToken,
  delayEndpointBaseUrl?: string,
  delayId?: string,
): Promise<{ url: string; jwt: string }> {
  const { userId, deviceId, memberId } = membership;

  const body = {
    room_id: matrixRoomId,
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
    bodyDalayParts = {
      delay_id: delayId,
      delay_timeout:
        Config.get().matrix_rtc_session.delegated_delayed_leave.delay_ms,
      delay_cs_api_url: delayEndpointBaseUrl,
    };
  }

  const res = await doNetworkOperationWithRetry(async () => {
    return await fetch(livekitServiceURL + "/get_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...body, ...bodyDalayParts }),
    });
  });

  if (!res.ok) {
    const msg = "SFU Config fetch failed with status code " + res.status;
    if (res.status === 404) {
      throw new NotSupportedError(msg);
    } else {
      throw parseErrorResponse(res, await res.text());
    }
  }
  return await res.json();
}

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

export interface GetSFUConfigParams {
  client: ClientOpenIDParts;
  /**
   * Data identifying the local user's session membership.
   */
  membership: CallMembershipIdentityParts;
  /**
   * The base URL of the LiveKit JWT service.
   */
  serviceUrl: string;
  /**
   * The ID of the Matrix room in which the session takes place.
   */
  roomId: string;
  /**
   * Whether we want to publish or only subscribe on the {@link transport}.
   */
  role: "publisher" | "subscriber";
  /**
   * The base URL of the Matrix homeserver, for delayed leave delegation.
   */
  delayEndpointBaseUrl?: string;
  /**
   * The delay ID of the leave event to be delegated to the JWT service.
   */
  delayId?: string;
  logger: Logger;
}

/**
 * Gets an {@link SFUConfig} appropriate for connecting to the SFU behind a
 * given service URL, using the legacy OpenID flow.
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

/**
 * Gets a JWT token appropriate for connecting to the SFU behind a given service
 * URL, using the legacy `/sfu/get` endpoint, which assigns us a legacy
 * (`<user_id>:<device_id>`) participant identity.
 */
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

/**
 * Gets a JWT token appropriate for connecting to the SFU behind a given service
 * URL, using the default `/get_token` endpoint, which assigns us a hashed
 * (pseudonymised) participant identity.
 */
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

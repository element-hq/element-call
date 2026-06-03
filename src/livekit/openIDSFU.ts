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

import {
  FailToGetOpenIdToken,
  NoMatrix2AuthorizationService,
} from "../utils/errors";
import { doNetworkOperationWithRetry } from "../utils/matrix";
import { Config } from "../config/Config";
import { JwtEndpointVersion } from "../state/CallViewModel/localMember/LocalTransport";

/**
 * Configuration and access tokens provided by the SFU on successful authentication.
 */
export interface SFUConfig {
  url: string;
  jwt: string;
  livekitAlias: string;
  // NOTE: Currently unused.
  livekitIdentity: string;
}

/**
 * Decoded details from the JWT.
 */
interface SFUJWTPayload {
  /**
   * Expiration time for the JWT.
   * Note: This value is in seconds since Unix epoch.
   */
  exp: number;
  /**
   * Name of the instance which authored the JWT
   */
  iss: string;
  /**
   * Time at which the JWT can start to be used.
   * Note: This value is in seconds since Unix epoch.
   */
  nbf: number;
  /**
   * Subject. The Livekit alias in this context.
   */
  sub: string;
  /**
   * The set of permissions for the user.
   */
  video: {
    canPublish: boolean;
    canSubscribe: boolean;
    room: string;
    roomJoin: boolean;
  };
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
 * @param client The Matrix client
 * @param membership Our own membership identity parts used to send to jwt service.
 * @param serviceUrl The URL of the livekit SFU service
 * @param roomId The room id used in the jwt request. This is NOT the livekit_alias. The jwt service will provide the alias. It maps matrix room ids <-> Livekit aliases.
 * @param opts Additional options to modify which endpoint with which data will be used to acquire the jwt token.
 * @param opts.forceJwtEndpoint This will use the old jwt endpoint which will create the rtc backend identity based on string concatenation
 * instead of a hash.
 * This function by default uses whatever is possible with the current jwt service installed next to the SFU.
 * For remote connections this does not matter, since we will not publish there we can rely on the newest option.
 * For our own connection we can only use the hashed version if we also send the new matrix2.0 sticky events.
 * @param opts.delayEndpointBaseUrl The URL of the matrix homeserver.
 * @param opts.delayId The delay id used for the jwt service to manage.
 * @param logger optional logger.
 * @returns Object containing the token information
 * @throws FailToGetOpenIdToken
 */
export async function getSFUConfigWithOpenID(
  client: OpenIDClientParts,
  membership: CallMembershipIdentityParts,
  serviceUrl: string,
  roomId: string,
  opts?: {
    forceJwtEndpoint?: JwtEndpointVersion;
    delayEndpointBaseUrl?: string;
    delayId?: string;
  },
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
  let sfuConfig: { url: string; jwt: string } | undefined;

  const tryBothJwtEndpoints = opts?.forceJwtEndpoint === undefined; // This is for SFUs where we do not publish.

  const forceMatrix2Jwt =
    opts?.forceJwtEndpoint === JwtEndpointVersion.Matrix_2_0;

  // We want to start using the new endpoint (with optional delay delegation)
  // if we can use both or if we are forced to use the new one.
  if (tryBothJwtEndpoints || forceMatrix2Jwt) {
    try {
      logger?.info(
        `Trying to get JWT with delegation for focus ${serviceUrl}...`,
      );
      const sfuConfig = await getLiveKitJWTWithDelayDelegation(
        membership,
        serviceUrl,
        roomId,
        openIdToken,
        opts?.delayEndpointBaseUrl,
        opts?.delayId,
      );

      return extractFullConfigFromToken(sfuConfig);
    } catch (e) {
      logger?.debug(`Failed fetching jwt with matrix 2.0 endpoint:`, e);
      // Make this throw a hard error in case we force the matrix2.0 endpoint.
      if (forceMatrix2Jwt) {
        throw new NoMatrix2AuthorizationService(e as Error);
      }
    }
  }

  // DEPRECATED
  // here we either have a sfuConfig or we already exited because of `if (forceMatrix2) throw ...`
  // The only case we can get into this condition is, if `forceMatrix2` is `false`
  try {
    logger?.info(
      `Trying to get JWT with legacy endpoint for focus ${serviceUrl}...`,
    );
    sfuConfig = await getLiveKitJWT(
      membership.deviceId,
      serviceUrl,
      roomId,
      openIdToken,
      opts?.delayEndpointBaseUrl,
      opts?.delayId,
    );
    logger?.info(`Got JWT from call's active focus URL.`);
    return extractFullConfigFromToken(sfuConfig);
  } catch (ex) {
    throw new FailToGetOpenIdToken(
      ex instanceof Error ? ex : new Error(`Unknown error ${ex}`),
    );
  }
}

function extractFullConfigFromToken(sfuConfig: {
  url: string;
  jwt: string;
}): SFUConfig {
  const [, payloadStr] = sfuConfig.jwt.split(".");
  const payload = JSON.parse(global.atob(payloadStr)) as SFUJWTPayload;
  return {
    jwt: sfuConfig.jwt,
    url: sfuConfig.url,
    livekitAlias: payload.video.room,
    // NOTE: Currently unused.
    // Probably also not helpful since we now compute the backendIdentity on joining the call so we can use it for the encryption manager.
    // The only reason for us to know it locally is to connect the right users with the lk world. (and to set our own keys)
    livekitIdentity: payload.sub,
  };
}

async function getLiveKitJWT(
  deviceId: string,
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
    const delayTimeoutMs =
      Config.get().matrix_rtc_session?.delayed_leave_event_delay_ms;
    bodyDalayParts = {
      delay_id: delayId,
      delay_timeout: delayTimeoutMs,
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
        device_id: deviceId,
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

export async function getLiveKitJWTWithDelayDelegation(
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
    const delayTimeoutMs =
      Config.get().matrix_rtc_session?.delayed_leave_event_delay_ms;
    bodyDalayParts = {
      delay_id: delayId,
      delay_timeout: delayTimeoutMs,
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

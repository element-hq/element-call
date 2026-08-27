/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Configuration and access tokens provided by the SFU on successful authentication.
 */
export interface SFUConfig {
  /**
   * The WebSocket URL of the LiveKit SFU. This is what we connect the LiveKit
   * room to. Note that this is NOT the JWT service URL
   * (`livekit_service_url`): the legacy JWT service returns this URL as part of
   * its response, while the CS-Api based flow requires us to know it upfront.
   */
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

/**
 * Complements the SFU websocket url and the JWT with the information encoded in
 * the JWT payload itself.
 * @param sfuConfig The SFU websocket url and the JWT to connect with.
 * @returns The full SFU config, including the LiveKit alias and identity.
 */
export function extractFullConfigFromToken(sfuConfig: {
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

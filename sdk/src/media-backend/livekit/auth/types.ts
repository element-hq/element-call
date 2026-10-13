/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type UnstableLivekitTransport } from "matrix-js-sdk/lib/matrixrtc";

/**
 * A transport and the homeserver it belongs to. The server name is what our
 * homeserver asks for a token for a transport with a `url`, over federation
 * where the server is not ours; a JWT service is reached directly.
 */
export interface TransportLocator {
  transport: UnstableLivekitTransport;
  serverName: string;
}

/** Whether we publish on a transport or only subscribe to it. */
export type ConnectionRole = "publisher" | "subscriber";

/** What authenticating with a transport yields: where to connect and with what. */
export interface SFUConfig {
  /**
   * The WebSocket URL of the SFU, as opposed to the JWT service URL in the
   * transport. The legacy JWT service returns it; the client-server API flow
   * has it from the transport.
   */
  url: string;
  jwt: string;
  livekitAlias: string;
  livekitIdentity: string;
}

/** The parts of the JWT payload the backend reads. */
interface SFUJWTPayload {
  /** The subject: the participant identity the token carries. */
  sub: string;
  video: {
    room: string;
  };
}

/** Completes the SFU websocket url and the JWT with what the JWT payload says. */
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
    livekitIdentity: payload.sub,
  };
}

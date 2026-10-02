/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";
import { type Logger } from "matrix-js-sdk/lib/logger";

import {
  getSFUConfig as getSFUConfigWithOpenID,
  type OpenIDClientParts,
} from "./openID";
import {
  type ClientDelegationParts,
  delegateDelayedLeave as delegateDelayedLeaveWithCSApi,
  type ClientGetTokenParts,
  getSFUConfig as getSFUConfigWithCSApi,
} from "./csApi";
import { type MatrixRTCMode } from "../../config/ConfigOptions";
import { MatrixError } from "matrix-js-sdk";
import { type LivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
import { type SFUConfig } from "./types";

/**
 * Checks whether an error means "this homeserver does not implement the
 * (unstable) MSC4195 endpoints".
 *
 * MSC4195 documents `M_NOT_FOUND` for this, but a homeserver without support
 * answers with whatever it uses for unknown endpoints (Synapse: 404 with
 * `M_UNRECOGNIZED`), so we accept any 404 as "unsupported".
 * @param e The error to check.
 */
function isEndpointUnsupported(e: unknown): boolean {
  return (
    e instanceof MatrixError &&
    (e.httpStatus === 404 ||
      e.errcode === "M_NOT_FOUND" ||
      e.errcode === "M_UNRECOGNIZED")
  );
}

export async function getSFUConfig({
  client,
  membership,
  transport,
  roomId,
  matrixRTCMode,
  logger,
}: {
  client: ClientGetTokenParts & OpenIDClientParts;
  membership: CallMembershipIdentityParts;
  transport: LivekitTransport;
  roomId: string;
  matrixRTCMode: MatrixRTCMode;
  logger: Logger;
}): Promise<SFUConfig> {
  if ("url" in transport) {
    try {
      return await getSFUConfigWithCSApi({
        client,
        membership,
        url: transport.url,
        roomId,
      });
    } catch (e) {
      if (isEndpointUnsupported(e)) {
        // Alias transport before checking whether we can fall back, otherwise
        // TypeScript gets confused about its type
        const transport_ = transport;
        if ("livekit_service_url" in transport_) {
          logger.warn(
            `Homeserver does not support the MSC4195 get_token endpoint, falling back to the OpenID flow with service ${transport_.livekit_service_url}`,
          );
          // Fall through
        } else {
          logger.error(
            `Homeserver does not support the MSC4195 get_token endpoint, cannot get token for transport ${transport.url}`,
          );
          throw e;
        }
      } else {
        throw e;
      }
    }
  }

  if ("livekit_service_url" in transport) {
    return await getSFUConfigWithOpenID(
      client,
      membership,
      transport.livekit_service_url,
      roomId,
      { matrixRTCMode },
      logger,
    );
  }

  throw new Error(`Unrecognized transport: ${JSON.stringify(transport)}`);
}

export async function delegateDelayedLeave({
  client,
  membership,
  transport,
  roomId,
  delayId,
  matrixRTCMode,
  logger,
}: {
  client: ClientDelegationParts & OpenIDClientParts;
  membership: CallMembershipIdentityParts;
  transport: LivekitTransport;
  roomId: string;
  delayId: string;
  matrixRTCMode: MatrixRTCMode;
  logger: Logger;
}): Promise<void> {
  if ("url" in transport) {
    try {
      await delegateDelayedLeaveWithCSApi({
        client,
        membership,
        url: transport.url,
        roomId,
        delayId,
      });
    } catch (e) {
      if (isEndpointUnsupported(e))
        logger.error(
          "Server misconfigured: transport contains a 'url' field but server does not support the MSC4195 delegate_delayed_leave endpoint",
        );
      throw e;
    }
  } else {
    // This will technically cause the service to issue a new JWT token, but
    // it's safe to discard. We're only interested in triggering delegation.
    await getSFUConfigWithOpenID(
      client,
      membership,
      transport.livekit_service_url,
      roomId,
      { matrixRTCMode, delayEndpointBaseUrl: client.baseUrl, delayId },
      logger,
    );
  }
}

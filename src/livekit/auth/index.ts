/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";
import { type Logger } from "matrix-js-sdk/lib/logger";

import { MatrixError } from "matrix-js-sdk";
import { type UnstableLivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
import * as openID from "./openID";
import * as csApi from "./csApi";
import { type SFUConfig } from "./types";
import { NoMatrix2AuthorizationService } from "../../utils/errors";

export { ClientOpenIDParts } from "./openID";
export { ClientGetTokenParts, ClientDelegationParts } from "./csApi";
export * from "./types";

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
  role,
  logger,
}: {
  client: csApi.ClientGetTokenParts & openID.ClientOpenIDParts;
  membership: CallMembershipIdentityParts;
  transport: UnstableLivekitTransport;
  roomId: string;
  role: "publisher" | "subscriber";
  logger: Logger;
}): Promise<SFUConfig> {
  if ("url" in transport) {
    try {
      return await csApi.getSFUConfig({
        client,
        membership,
        url: transport.url,
        roomId,
      });
    } catch (e) {
      if (isEndpointUnsupported(e)) {
        const mayFallBack =
          role === "subscriber" && "livekit_service_url" in transport;
        if (mayFallBack) {
          logger.warn(
            `Homeserver does not support the MSC4195 get_token endpoint, falling back to the OpenID flow with service ${transport.livekit_service_url}`,
          );
          // Fall through
        } else {
          logger.error(
            `Homeserver does not support the MSC4195 get_token endpoint, cannot get token for transport ${transport.url}`,
          );
          throw new NoMatrix2AuthorizationService(e as Error);
        }
      } else {
        throw e;
      }
    }
  }

  return await openID.getSFUConfig({
    client,
    membership,
    serviceUrl: transport.livekit_service_url,
    roomId,
    role,
    logger,
  });
}

export async function delegateDelayedLeave({
  client,
  membership,
  transport,
  roomId,
  delayId,
  logger,
}: {
  client: csApi.ClientDelegationParts & openID.ClientOpenIDParts;
  membership: CallMembershipIdentityParts;
  transport: UnstableLivekitTransport;
  roomId: string;
  delayId: string;
  logger: Logger;
}): Promise<void> {
  if ("url" in transport) {
    try {
      await csApi.delegateDelayedLeave({
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
    await openID.getSFUConfig({
      client,
      membership,
      serviceUrl: transport.livekit_service_url,
      roomId,
      role: "publisher",
      delayEndpointBaseUrl: client.baseUrl,
      delayId,
      logger,
    });
  }
}

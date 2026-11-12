/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Logger } from "matrix-js-sdk/lib/logger";
import {
  type CallMembership,
  isUnstableLivekitTransport,
  type Transport,
} from "matrix-js-sdk/lib/matrixrtc";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";

import { isCsApiUnavailable } from "./auth";
import * as csApi from "./auth/csApi";
import { decodeSFUJWTPayload } from "./auth/types";

export interface RemotePublishTransportParams {
  client: csApi.ClientGetTokenParts;
  /** The members whose SFUs are the candidates. */
  memberships: CallMembership[];
  ownMembershipIdentity: CallMembershipIdentityParts;
  roomId: string;
  slotId: string;
  logger: Logger;
}

/**
 * The SFU of another member that its homeserver lets us publish on, as the
 * transport to advertise, or null where none does. Candidates are tried
 * oldest membership first, each SFU once, and each is checked by asking for a
 * publisher token through our homeserver (MSC4195): a homeserver may restrict
 * remote publishers, which shows as a token without the publish grant.
 */
export async function findRemotePublishLivekitTransport({
  client,
  memberships,
  ownMembershipIdentity: own,
  roomId,
  slotId,
  logger,
}: RemotePublishTransportParams): Promise<Transport | null> {
  logger.info(
    "No local transport available, looking for another member's SFU to publish on",
  );
  const tried = new Set<string>();
  const byAge = [...memberships].sort((a, b) => a.createdTs() - b.createdTs());
  for (const membership of byAge) {
    if (
      membership.userId === own.userId &&
      membership.deviceId === own.deviceId
    )
      continue;
    for (const transport of membership.transports) {
      // Publishing remotely goes through the client-server API, which a JWT
      // service cannot stand in for, so only a `url` qualifies
      if (!isUnstableLivekitTransport(transport) || !("url" in transport))
        continue;
      const { url } = transport;
      const serverName = membership.getTransportServerName(transport);
      const key = JSON.stringify([url, serverName]);
      if (tried.has(key)) continue;
      tried.add(key);
      try {
        const { jwt } = await csApi.getSFUConfig({
          client,
          membership: own,
          url,
          serverName,
          roomId,
          slotId,
        });
        try {
          // The SFU treats an absent canPublish grant as publishing allowed.
          if (decodeSFUJWTPayload(jwt).video.canPublish !== false) {
            logger.info(`Publishing on remote SFU ${url} of ${serverName}`);
            return { type: "livekit", url, server_name: serverName };
          }
          logger.info(
            `${serverName} does not let us publish on ${url}, skipping`,
          );
          continue;
        } catch (e) {
          logger.info(
            `${serverName}: failed to decode SFUJWT payload: ${e}, skipping`,
          );
          continue;
        }
      } catch (e) {
        if (isCsApiUnavailable(e)) {
          // Without the endpoint no further candidate can work
          logger.warn(
            `Cannot use the MSC4195 get_token endpoint (${e}), so no remote SFU can be used`,
          );
          return null;
        }
        logger.warn(`Failed to get a token for ${url} of ${serverName}:`, e);
        continue;
      }
    }
  }
  return null;
}

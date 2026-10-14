/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Logger } from "matrix-js-sdk/lib/logger";
import {
  type CallMembership,
  getRemoteLivekitPublishCandidates,
  type LivekitPublishCandidate,
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
 * transport to advertise, or null where no member's SFU will do. Candidates
 * are tried oldest membership first, and each one is checked by asking for a
 * publisher token through our homeserver (MSC4195): a homeserver may restrict
 * remote publishers, which shows as a token without the publish grant.
 */
export async function findRemotePublishTransport({
  client,
  memberships,
  ownMembershipIdentity,
  roomId,
  slotId,
  logger,
}: RemotePublishTransportParams): Promise<Transport | null> {
  logger.info(
    "No local transport available, looking for another member's SFU to publish on",
  );
  const candidates = getRemoteLivekitPublishCandidates(
    memberships,
    ownMembershipIdentity,
  );
  for (const candidate of candidates) {
    const outcome = await tryCandidate(candidate);
    if (outcome === "usable") return candidate.transport;
    if (outcome === "noCsApi") return null;
  }
  return null;

  /** "noCsApi" ends the search: without the endpoint no candidate can work. */
  async function tryCandidate({
    url,
    serverName,
  }: LivekitPublishCandidate): Promise<"usable" | "unusable" | "noCsApi"> {
    try {
      const { jwt } = await csApi.getSFUConfig({
        client,
        membership: ownMembershipIdentity,
        url,
        serverName,
        roomId,
        slotId,
      });
      if (decodeSFUJWTPayload(jwt).video.canPublish) {
        logger.info(`Publishing on remote SFU ${url} of ${serverName}`);
        return "usable";
      }
      logger.info(`${serverName} does not let us publish on ${url}, skipping`);
    } catch (e) {
      if (isCsApiUnavailable(e)) {
        logger.warn(
          `Cannot use the MSC4195 get_token endpoint (${e}), so no remote SFU can be used`,
        );
        return "noCsApi";
      }
      logger.warn(`Failed to get a token for ${url} of ${serverName}:`, e);
    }
    return "unusable";
  }
}

/*
Copyright 2025 Element Creations Ltd.

SPDX-License-IdFentifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixClient } from "matrix-js-sdk";
import { logger as rootLogger, type Logger } from "matrix-js-sdk/lib/logger";
import {
  type CallMembership,
  getRemoteLivekitPublishCandidates,
  type LivekitPublishCandidate,
} from "matrix-js-sdk/lib/matrixrtc";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";

import { Config } from "../../../config/Config.ts";
import { MatrixRTCTransportMissingError } from "../../../utils/errors.ts";
import { customTransport as customTransportSetting } from "../../../settings/settings.ts";
import { RtcTransportAutoDiscovery } from "./RtcTransportAutoDiscovery.ts";
import {
  type TransportLocator,
  isCsApiUnavailable,
} from "../../../livekit/auth";
import * as csApi from "../../../livekit/auth/csApi.ts";
import { decodeSFUJWTPayload } from "../../../livekit/auth/types.ts";

export type LocalTransportClient = Pick<
  MatrixClient,
  "getDomain" | "_unstable_getRTCTransports" | "_unstable_getLivekitToken"
>;

export interface LocalTransportParams {
  client: LocalTransportClient;
  /**
   * The current members of the session. If our own homeserver provides no
   * transport, we fall back to publishing on one of theirs.
   */
  memberships: CallMembership[];
  /**
   * Data identifying our own session membership, needed to request tokens.
   */
  ownMembershipIdentity: CallMembershipIdentityParts;
  /**
   * The ID of the Matrix room in which the session takes place.
   */
  roomId: string;
  /**
   * The ID of the MatrixRTC slot in which the session takes place.
   */
  slotId: string;
  logger?: Logger;
}

/**
 * Determines the transport to advertise in our MatrixRTC membership and publish
 * media on.
 *
 * This tries to fall back to the SFU of another session member if needed.
 *
 * @throws {MatrixRTCTransportMissingError} if neither a local nor a remote
 *   transport is available.
 */
export async function getLocalTransport({
  client,
  memberships,
  ownMembershipIdentity,
  roomId,
  slotId,
  logger: parentLogger = rootLogger,
}: LocalTransportParams): Promise<TransportLocator> {
  const logger = parentLogger.getChild("[LocalTransport]");
  const domain = client.getDomain();
  if (domain === null) throw new Error("No server name");
  const ownServerName: string = domain;

  const discovery = new RtcTransportAutoDiscovery({
    client,
    resolvedConfig: Config.get(),
    logger,
  });

  // Respect the user's custom transport, if set
  const transport =
    customTransportSetting.value$.value ??
    (await discovery.discoverPreferredTransport());

  if (transport !== null) {
    // A custom transport may point at another homeserver's SFU
    const serverName =
      "server_name" in transport && transport.server_name !== undefined
        ? transport.server_name
        : ownServerName;
    return { transport, serverName };
  }

  logger.info(
    "No local transport available, looking for another member's SFU to publish on",
  );
  const candidates = getRemoteLivekitPublishCandidates(
    memberships,
    ownMembershipIdentity,
  );
  for (const candidate of candidates) {
    const locator = await tryRemoteCandidate(candidate);
    if (locator !== null) return locator;
  }
  throw new MatrixRTCTransportMissingError(ownServerName);

  /**
   * Checks whether the homeserver behind a candidate SFU lets us publish on
   * it. Servers MAY restrict remote publishers, in which case the token comes
   * back without the publish grant and we move on to the next candidate.
   * @returns The locator to publish with, or null if this candidate is unusable.
   * @throws {MatrixRTCTransportMissingError} if the client-server API is not
   *   available at all, as no candidate can work then.
   */
  async function tryRemoteCandidate({
    url,
    serverName,
    transport,
  }: LivekitPublishCandidate): Promise<TransportLocator | null> {
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
        return { transport, serverName };
      }
      logger.info(`${serverName} does not let us publish on ${url}, skipping`);
    } catch (e) {
      if (isCsApiUnavailable(e)) {
        logger.warn(
          `Cannot use the MSC4195 get_token endpoint (${e}), so no remote SFU can be used`,
        );
        throw new MatrixRTCTransportMissingError(ownServerName);
      }
      logger.warn(`Failed to get a token for ${url} of ${serverName}:`, e);
    }
    return null;
  }
}

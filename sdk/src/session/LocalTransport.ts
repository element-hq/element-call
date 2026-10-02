/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixClient } from "matrix-js-sdk";
import { type Logger } from "matrix-js-sdk/lib/logger";
import { type LivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";

import { type MatrixRTCMode } from "../config";
import { getSFUConfigWithOpenID, type SFUConfig } from "./openIDSFU";
import { RtcTransportAutoDiscovery } from "./RtcTransportAutoDiscovery";
import { MatrixRTCTransportMissingError } from "../errors";

/** The transport the local member publishes on, authenticated with. */
export interface LocalTransport {
  transport: LivekitTransport;
  sfuConfig: SFUConfig;
}

export function isLocalTransport(
  obj: LivekitTransport | LocalTransport,
): obj is LocalTransport {
  return "transport" in obj && "sfuConfig" in obj;
}

interface Props {
  client: Pick<
    MatrixClient,
    | "getDomain"
    | "_unstable_getRTCTransports"
    | "getOpenIdToken"
    | "getDeviceId"
  >;
  ownMembershipIdentity: CallMembershipIdentityParts;
  roomId: string;
  matrixRTCMode: MatrixRTCMode;
  /** Skip discovery and use this transport. */
  transportUrl?: string;
  /** Use this transport when the homeserver advertises none. */
  fallbackTransportUrl?: string;
  logger: Logger;
}

/**
 * The transport the local member publishes on: the one the host names, else
 * the homeserver's preferred one, else the host's fallback; authenticated
 * with, so that the session can be joined with a token in hand.
 */
export async function getLocalTransport({
  client,
  ownMembershipIdentity,
  roomId,
  matrixRTCMode,
  transportUrl,
  fallbackTransportUrl,
  logger,
}: Props): Promise<LocalTransport> {
  const transport: LivekitTransport | null = transportUrl
    ? { type: "livekit", livekit_service_url: transportUrl }
    : await new RtcTransportAutoDiscovery({
        client,
        fallbackTransportUrl,
        logger,
      }).discoverPreferredTransport();
  if (transport === null)
    throw new MatrixRTCTransportMissingError(client.getDomain() ?? "");
  const sfuConfig = await getSFUConfigWithOpenID(
    client,
    ownMembershipIdentity,
    transport.livekit_service_url,
    roomId,
    { matrixRTCMode },
    logger,
  );
  return { transport, sfuConfig };
}

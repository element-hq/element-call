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
  logger: Logger;
}

/**
 * The transport the local member publishes on: the homeserver's preferred
 * one, authenticated with so that the session can be joined with a token in
 * hand. Only the homeserver is asked; the SDK has no configuration of its own
 * to fall back on.
 */
export async function getLocalTransport({
  client,
  ownMembershipIdentity,
  roomId,
  matrixRTCMode,
  logger,
}: Props): Promise<LocalTransport> {
  const transport = await new RtcTransportAutoDiscovery({
    client,
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

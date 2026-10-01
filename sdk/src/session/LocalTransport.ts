/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixClient } from "matrix-js-sdk";
import { type Logger } from "matrix-js-sdk/lib/logger";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";

import {
  DEFAULT_CONFIG,
  type MatrixRTCMode,
} from "../../../src/config/ConfigOptions";
import { getSFUConfigWithOpenID } from "../../../src/livekit/openIDSFU";
import { type LocalTransport } from "../../../src/state/CallViewModel/localMember/LocalTransport";
import { RtcTransportAutoDiscovery } from "../../../src/state/CallViewModel/localMember/RtcTransportAutoDiscovery";
import { MatrixRTCTransportMissingError } from "../../../src/utils/errors";

export type { LocalTransport };

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
    resolvedConfig: DEFAULT_CONFIG,
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

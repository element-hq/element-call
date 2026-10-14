/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixClient } from "matrix-js-sdk";
import { type Logger } from "matrix-js-sdk/lib/logger";
import {
  type CallMembership,
  type Transport,
} from "matrix-js-sdk/lib/matrixrtc";

import { type RTCParticipationOptions } from "../api";
import { MatrixRTCTransportMissingError } from "../errors";
import { type MediaBackend } from "../media-backend/api";
import { TransportAutoDiscovery } from "./TransportAutoDiscovery";

/**
 * The transport the local member advertises: the one the host names, else the
 * homeserver's first of the type the backend serves, else the host's fallback,
 * else another member's that the backend can publish on.
 *
 * @throws {MatrixRTCTransportMissingError} where none of these exists.
 */
export async function discoverLocalTransport(
  client: Pick<MatrixClient, "getDomain" | "_unstable_getRTCTransports">,
  backend: Pick<MediaBackend, "transportType" | "findRemotePublishTransport">,
  memberships: CallMembership[],
  {
    transport: override,
    fallbackTransport,
  }: Pick<RTCParticipationOptions, "transport" | "fallbackTransport">,
  logger: Logger,
): Promise<Transport> {
  const transport =
    override ??
    (await new TransportAutoDiscovery({
      client,
      transportType: backend.transportType,
      fallbackTransport,
      logger,
    }).discoverPreferredTransport()) ??
    (await backend.findRemotePublishTransport(memberships));
  if (transport === null)
    throw new MatrixRTCTransportMissingError(client.getDomain() ?? "");
  return transport;
}

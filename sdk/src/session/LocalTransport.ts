/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixClient } from "matrix-js-sdk";
import { type Logger } from "matrix-js-sdk/lib/logger";
import { type Transport } from "matrix-js-sdk/lib/matrixrtc";

import { type MatrixRTCClientOptions } from "../api";
import { MatrixRTCTransportMissingError } from "../errors";
import { RtcTransportAutoDiscovery } from "./RtcTransportAutoDiscovery";

/**
 * The transport the local member advertises: the one the host names, else the
 * homeserver's first of the type the backend serves, else the host's fallback.
 * The two URL options are LiveKit service URLs, and turning one into a
 * membership transport is the one piece of LiveKit knowledge outside the
 * backend. It stays here, for hosts that configure a URL rather than a
 * transport, and goes once the options take a `Transport`.
 */
export async function discoverLocalTransport(
  client: Pick<MatrixClient, "getDomain" | "_unstable_getRTCTransports">,
  transportType: string,
  {
    transportUrl,
    fallbackTransportUrl,
  }: Pick<MatrixRTCClientOptions, "transportUrl" | "fallbackTransportUrl">,
  logger: Logger,
): Promise<Transport> {
  const transport = transportUrl
    ? { type: "livekit", livekit_service_url: transportUrl }
    : await new RtcTransportAutoDiscovery({
        client,
        transportType,
        fallbackTransportUrl,
        logger,
      }).discoverPreferredTransport();
  if (transport === null)
    throw new MatrixRTCTransportMissingError(client.getDomain() ?? "");
  return transport;
}

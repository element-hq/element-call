/*
Copyright 2025 Element Creations Ltd.

SPDX-License-IdFentifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type UnstableLivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
import { type MatrixClient } from "matrix-js-sdk";
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";

import { Config } from "../../../config/Config.ts";
import { MatrixRTCTransportMissingError } from "../../../utils/errors.ts";
import { customLivekitUrl } from "../../../settings/settings.ts";
import { RtcTransportAutoDiscovery } from "./RtcTransportAutoDiscovery.ts";

/**
 * Determines the transport to advertise in our MatrixRTC membership and publish
 * media on.
 */
export async function getLocalTransport(
  client: Pick<MatrixClient, "getDomain" | "_unstable_getRTCTransports">,
): Promise<UnstableLivekitTransport> {
  const discovery = new RtcTransportAutoDiscovery({
    client: client,
    resolvedConfig: Config.get(),
    logger: rootLogger.getChild("[LocalTransport]"),
  });
  const customUrl = customLivekitUrl.value$.value;

  // Respect the user's custom URL, if set
  const transport: UnstableLivekitTransport | null = customUrl
    ? { type: "livekit", livekit_service_url: customUrl }
    : await discovery.discoverPreferredTransport();

  if (transport === null)
    throw new MatrixRTCTransportMissingError(client.getDomain() ?? "");

  // TODO: Since this module no longer maps auth errors to fatal user-facing
  // errors (as it doesn't even perform auth), that needs to happen somewhere
  // else.
  return transport;
}

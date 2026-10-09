/*
Copyright 2025 Element Creations Ltd.

SPDX-License-IdFentifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixClient } from "matrix-js-sdk";
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";

import { Config } from "../../../config/Config.ts";
import { MatrixRTCTransportMissingError } from "../../../utils/errors.ts";
import { customTransport as customTransportSetting } from "../../../settings/settings.ts";
import { RtcTransportAutoDiscovery } from "./RtcTransportAutoDiscovery.ts";
import { type TransportLocator } from "../../../livekit/auth/types.ts";

/**
 * Determines the transport to advertise in our MatrixRTC membership and publish
 * media on.
 */
export async function getLocalTransport(
  client: Pick<MatrixClient, "getDomain" | "_unstable_getRTCTransports">,
): Promise<TransportLocator> {
  const serverName = client.getDomain();
  if (serverName === null) throw new Error("No server name");

  const discovery = new RtcTransportAutoDiscovery({
    client,
    resolvedConfig: Config.get(),
    logger: rootLogger.getChild("[LocalTransport]"),
  });

  // Respect the user's custom transport, if set
  const transport =
    customTransportSetting.value$.value ??
    (await discovery.discoverPreferredTransport());

  if (transport === null) throw new MatrixRTCTransportMissingError(serverName);

  return { transport, serverName };
}

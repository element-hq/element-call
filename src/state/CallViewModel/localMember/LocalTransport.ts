/*
Copyright 2025 Element Creations Ltd.

SPDX-License-IdFentifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type UnstableLivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
import { type MatrixClient } from "matrix-js-sdk";
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";

import { Config } from "../../../config/Config.ts";
import {
  FailToGetOpenIdToken,
  MatrixRTCTransportMissingError,
  NoMatrix2AuthorizationService,
} from "../../../utils/errors.ts";
import { customLivekitUrl } from "../../../settings/settings.ts";
import { RtcTransportAutoDiscovery } from "./RtcTransportAutoDiscovery.ts";
import {
  getSFUConfig,
  type ClientGetTokenParts,
  type ClientOpenIDParts,
  type SFUConfig,
} from "../../../livekit/auth";

interface Props {
  ownMembershipIdentity: CallMembershipIdentityParts;
  client: Pick<MatrixClient, "getDomain" | "_unstable_getRTCTransports"> &
    ClientGetTokenParts &
    ClientOpenIDParts;
  // Used by the jwt service to create the livekit room and compute the livekit alias.
  roomId: string;
}

export interface LocalTransport {
  transport: UnstableLivekitTransport;
  sfuConfig: SFUConfig;
}

export function isLocalTransport(
  obj: UnstableLivekitTransport | LocalTransport,
): obj is LocalTransport {
  return "transport" in obj && "sfuConfig" in obj;
}

/**
 * Connects to the JWT service and determines the transport that the local member should use.
 *
 * @prop useOldJwtEndpoint Whether to set forceOldJwtEndpoint on the returned transport and to use the old JWT endpoint.
 * This is used when the connection manager needs to know if it has to use the legacy endpoint which implies a string concatenated rtcBackendIdentity.
 * (which is expected for non sticky event based rtc member events)
 * @returns The transport to advertise in our MatrixRTC membership and publish media on.
 * @throws MatrixRTCTransportMissingError | FailToGetOpenIdToken
 */
export async function getLocalTransport({
  ownMembershipIdentity,
  client,
  roomId,
}: Props): Promise<LocalTransport> {
  const logger = rootLogger.getChild("[LocalTransport]");
  const discovery = new RtcTransportAutoDiscovery({
    client: client,
    resolvedConfig: Config.get(),
    logger: logger,
  });
  const customUrl = customLivekitUrl.value$.value;

  // Respect the user's custom URL, if set
  const transport: UnstableLivekitTransport | null = customUrl
    ? { type: "livekit", livekit_service_url: customUrl }
    : await discovery.discoverPreferredTransport();

  if (transport === null)
    throw new MatrixRTCTransportMissingError(client.getDomain() ?? "");

  try {
    return {
      transport,
      sfuConfig: await getSFUConfig({
        client,
        membership: ownMembershipIdentity,
        transport,
        roomId,
        role: "publisher",
        logger,
      }),
    };
  } catch (e) {
    logger.error(
      `Failed to authenticate to transport ${JSON.stringify(transport)}`,
      e,
    );
    throw mapAuthErrorToUserFriendlyError(e);
  }
}

function mapAuthErrorToUserFriendlyError(e: unknown): Error {
  if (
    e instanceof FailToGetOpenIdToken ||
    e instanceof NoMatrix2AuthorizationService
  ) {
    // rethrow as is
    return e;
  }
  // Catch others and rethrow as FailToGetOpenIdToken that has user friendly message.
  return new FailToGetOpenIdToken(
    e instanceof Error ? e : new Error(String(e)),
  );
}

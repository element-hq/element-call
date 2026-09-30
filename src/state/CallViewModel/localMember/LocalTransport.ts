/*
Copyright 2025 Element Creations Ltd.

SPDX-License-IdFentifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type LivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
import { type MatrixClient } from "matrix-js-sdk";
import { logger as rootLogger, type Logger } from "matrix-js-sdk/lib/logger";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";

import { Config } from "../../../config/Config.ts";
import {
  FailToGetOpenIdToken,
  MatrixRTCTransportMissingError,
  NoMatrix2AuthorizationService,
} from "../../../utils/errors.ts";
import {
  getSFUConfigWithOpenID,
  type SFUConfig,
  type OpenIDClientParts,
} from "../../../livekit/openIDSFU.ts";
import { customLivekitUrl } from "../../../settings/settings.ts";
import { RtcTransportAutoDiscovery } from "./RtcTransportAutoDiscovery.ts";
import { type MatrixRTCMode } from "../../../config/ConfigOptions.ts";

interface Props {
  ownMembershipIdentity: CallMembershipIdentityParts;
  client: Pick<MatrixClient, "getDomain" | "_unstable_getRTCTransports"> &
    OpenIDClientParts;
  // Used by the jwt service to create the livekit room and compute the livekit alias.
  roomId: string;
  matrixRTCMode: MatrixRTCMode;
}

export interface LocalTransport {
  transport: LivekitTransport;
  sfuConfig: SFUConfig;
}

export function isLocalTransport(
  obj: LivekitTransport | LocalTransport,
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
  matrixRTCMode,
}: Props): Promise<LocalTransport> {
  const logger = rootLogger.getChild("[LocalTransport]");
  const discovery = new RtcTransportAutoDiscovery({
    client: client,
    resolvedConfig: Config.get(),
    logger: logger,
  });
  const customUrl = customLivekitUrl.value$.value;

  // Respect the user's custom URL, if set
  const transport: LivekitTransport | null = customUrl
    ? { type: "livekit", livekit_service_url: customUrl }
    : await discovery.discoverPreferredTransport();

  if (transport === null)
    throw new MatrixRTCTransportMissingError(client.getDomain() ?? "");

  try {
    return await doOpenIdAndJWTFromUrl(
      transport,
      matrixRTCMode,
      ownMembershipIdentity,
      roomId,
      client,
      logger,
    );
  } catch (e) {
    logger.error(
      `Failed to authenticate to transport ${transport.livekit_service_url}`,
      e,
    );
    throw mapAuthErrorToUserFriendlyError(e);
  }
}

/**
 *  Utility to ensure the user can authenticate with the SFU.
 *  We will call `getSFUConfigWithOpenID` once per transport here as it's our
 *  only mechanism of validation. This means we will also ask the
 *  homeserver for a OpenID token a few times. Since OpenID tokens are single
 *  use we don't want to risk any issues by re-using a token.
 *
 *  @param transport The transport to authenticate with.
 *  @param matrixRTCMode Whether to force the JWT endpoint to be used.
 *  @param membership The identity of the local member.
 *  @param roomId The room ID to use for the JWT.
 *  @param client The client to use for the OpenID token.
 *
 *  @throws FailToGetOpenIdToken, NoMatrix2AuthorizationService
 */
async function doOpenIdAndJWTFromUrl(
  transport: LivekitTransport,
  matrixRTCMode: MatrixRTCMode,
  membership: CallMembershipIdentityParts,
  roomId: string,
  client: Pick<MatrixClient, "_unstable_getRTCTransports"> & OpenIDClientParts,
  logger?: Logger,
): Promise<LocalTransport> {
  const sfuConfig = await getSFUConfigWithOpenID(
    client,
    membership,
    transport.livekit_service_url,
    roomId,
    { matrixRTCMode },
    logger,
  );
  return {
    transport,
    sfuConfig,
  };
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

/*
Copyright 2025 Element Creations Ltd.

SPDX-License-IdFentifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type CallMembership,
  type LivekitTransportConfig,
} from "matrix-js-sdk/lib/matrixrtc";
import { type MatrixClient } from "matrix-js-sdk";
import { distinctUntilChanged, from, map, of, switchMap } from "rxjs";
import { logger as rootLogger, type Logger } from "matrix-js-sdk/lib/logger";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";

import { type Behavior } from "../../Behavior.ts";
import { type Epoch, type ObservableScope } from "../../ObservableScope.ts";
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
import { areLivekitTransportsEqual } from "../remoteMembers/MatrixLivekitMembers.ts";
import { customLivekitUrl } from "../../../settings/settings.ts";
import { RtcTransportAutoDiscovery } from "./RtcTransportAutoDiscovery.ts";

/*
 * It figures out “which LiveKit focus URL/alias the local user should use,”
 * and ensures the SFU path is primed before advertising that choice.
 */
interface Props {
  scope: ObservableScope;
  ownMembershipIdentity: CallMembershipIdentityParts;
  memberships$: Behavior<Epoch<CallMembership[]>>;
  client: Pick<
    MatrixClient,
    "getDomain" | "baseUrl" | "_unstable_getRTCTransports"
  > &
    OpenIDClientParts;
  // Used by the jwt service to create the livekit room and compute the livekit alias.
  roomId: string;
  forceJwtEndpoint: JwtEndpointVersion;
}

export enum JwtEndpointVersion {
  Legacy = "legacy",
  Matrix_2_0 = "matrix_2_0",
}

// TODO livekit_alias-cleanup
// 1. We need to move away from transports map to connections!!!
//
// 2. We need to stop sending livekit_alias all together
//
//
// 1.
// Transports are just the jwt service adress but do not contain the information which room on this transport to use.
// That requires slot and roomId.
//
// We need one connection per room on the transport.
//
// We need an object that contains:
// transport
// roomId
// slotId
//
// To map to the connections. Prosposal: `ConnectionIdentifier`
//
// 2.
// We need to make sure we do not sent livekit_alias in sticky events and that we drop all code for sending state events!
export interface LocalTransportWithSFUConfig {
  transport: LivekitTransportConfig;
  sfuConfig: SFUConfig;
}

export function isLocalTransportWithSFUConfig(
  obj: LivekitTransportConfig | LocalTransportWithSFUConfig,
): obj is LocalTransportWithSFUConfig {
  return "transport" in obj && "sfuConfig" in obj;
}

export interface LocalTransport {
  /**
   * The transport to be advertised in our MatrixRTC membership. `null` when not
   * yet fetched/validated.
   */
  advertised$: Behavior<LivekitTransportConfig | null>;
  /**
   * The transport to connect to and publish media on. `null` when not yet known
   * or available.
   */
  active$: Behavior<LocalTransportWithSFUConfig | null>;
}

/**
 * Connects to the JWT service and determines the transports that the local member should use.
 *
 * @prop useOldJwtEndpoint Whether to set forceOldJwtEndpoint on the returned transport and to use the old JWT endpoint.
 * This is used when the connection manager needs to know if it has to use the legacy endpoint which implies a string concatenated rtcBackendIdentity.
 * (which is expected for non sticky event based rtc member events)
 * @returns The transport to advertise in the local MatrixRTC membership, along with the transport to actively publish media to.
 * @throws MatrixRTCTransportMissingError | FailToGetOpenIdToken
 */
export const createLocalTransport$ = ({
  scope,
  memberships$,
  ownMembershipIdentity,
  client,
  roomId,
  forceJwtEndpoint,
}: Props): LocalTransport => {
  const logger = rootLogger.getChild("[LocalTransport]");

  const transportDiscovery = new RtcTransportAutoDiscovery({
    client: client,
    resolvedConfig: Config.get(),
    logger: logger,
  });

  // Get the preferred transport from the current deployment.
  const discoveredTransport$ = from(
    transportDiscovery.discoverPreferredTransport(),
  );

  const preferredConfig$ = customLivekitUrl.value$
    .pipe(
      switchMap((customUrl) => {
        if (customUrl) {
          return of({
            type: "livekit",
            livekit_service_url: customUrl,
          } as LivekitTransportConfig);
        } else {
          return discoveredTransport$;
        }
      }),
    )
    .pipe(
      map((config) => {
        if (!config) {
          // Bubbled up from the preferredConfig$ observable.
          throw new MatrixRTCTransportMissingError(client.getDomain() ?? "");
        }
        return config;
      }),
      distinctUntilChanged(areLivekitTransportsEqual),
    );

  const preferredTransport$ = preferredConfig$.pipe(
    switchMap(async (transport) => {
      try {
        return await doOpenIdAndJWTFromUrl(
          transport,
          forceJwtEndpoint,
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
    }),
  );

  // Always publish on and advertise the preferred transport.
  return {
    advertised$: scope.behavior(
      preferredTransport$.pipe(
        map((t) => t.transport),
        distinctUntilChanged(areLivekitTransportsEqual),
      ),
      null,
    ),
    active$: scope.behavior(
      preferredTransport$.pipe(
        // XXX: WORK AROUND due to a reconnection glitch.
        // To remove when we have a proper way to refresh the delegation event ID without refreshing
        // the whole credentials.
        // We deliberately hide any changes to the SFU config because we
        // do not want the app to reconnect whenever the JWT
        // token changes due to us delegating a new delayed event. The
        // initial SFU config for the transport is all the app needs.
        distinctUntilChanged((prev, next) =>
          areLivekitTransportsEqual(prev.transport, next.transport),
        ),
      ),
      null,
    ),
  };
};

/**
 *  Utility to ensure the user can authenticate with the SFU.
 *  We will call `getSFUConfigWithOpenID` once per transport here as it's our
 *  only mechanism of validation. This means we will also ask the
 *  homeserver for a OpenID token a few times. Since OpenID tokens are single
 *  use we don't want to risk any issues by re-using a token.
 *
 *  @param transport The transport to authenticate with.
 *  @param forceJwtEndpoint Whether to force the JWT endpoint to be used.
 *  @param membership The identity of the local member.
 *  @param roomId The room ID to use for the JWT.
 *  @param client The client to use for the OpenID token.
 *
 *  @throws FailToGetOpenIdToken, NoMatrix2AuthorizationService
 */
async function doOpenIdAndJWTFromUrl(
  transport: LivekitTransportConfig,
  forceJwtEndpoint: JwtEndpointVersion,
  membership: CallMembershipIdentityParts,
  roomId: string,
  client: Pick<MatrixClient, "_unstable_getRTCTransports"> & OpenIDClientParts,
  logger?: Logger,
): Promise<LocalTransportWithSFUConfig> {
  const sfuConfig = await getSFUConfigWithOpenID(
    client,
    membership,
    transport.livekit_service_url,
    roomId,
    {
      forceJwtEndpoint: forceJwtEndpoint,
    },
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

/*
Copyright 2025 Element Creations Ltd.

SPDX-License-IdFentifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type CallMembership,
  isLivekitTransportConfig,
  type Transport,
  type LivekitTransportConfig,
} from "matrix-js-sdk/lib/matrixrtc";
import { MatrixError, type MatrixClient } from "matrix-js-sdk";
import {
  distinctUntilChanged,
  first,
  from,
  map,
  merge,
  of,
  startWith,
  switchMap,
  tap,
} from "rxjs";
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";
import { AutoDiscovery } from "matrix-js-sdk/lib/autodiscovery";
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

const logger = rootLogger.getChild("[LocalTransport]");

/*
 * It figures out “which LiveKit focus URL/alias the local user should use,”
 * optionally aligning with the oldest member, and ensures the SFU path is primed
 * before advertising that choice.
 */
interface Props {
  scope: ObservableScope;
  ownMembershipIdentity: CallMembershipIdentityParts;
  memberships$: Behavior<Epoch<CallMembership[]>>;
  client: Pick<
    MatrixClient,
    "getDomain" | "baseUrl" | "_unstable_getRTCTransports" | "getAccessToken"
  > &
    OpenIDClientParts;
  // Used by the jwt service to create the livekit room and compute the livekit alias.
  roomId: string;
  useOldestMember: boolean;
  forceJwtEndpoint: JwtEndpointVersion;
  delayId$: Behavior<string | null>;
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

interface LocalTransport {
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
 * @prop useOldestMember Whether to use the same transport as the oldest member.
 * This will only update once the first oldest member appears. Will not recompute if the oldest member leaves.
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
  useOldestMember,
  forceJwtEndpoint,
  delayId$,
}: Props): LocalTransport => {
  /**
   * The LiveKit transport in use by the oldest RTC membership. `null` when the
   * oldest member has no such transport.
   */
  const oldestMemberTransport$ = scope.behavior<LivekitTransportConfig | null>(
    memberships$.pipe(
      map((memberships) => {
        const oldestMember = memberships.value[0];
        if (oldestMember === undefined) {
          logger.info("Oldest member: not found");
          return null;
        }
        const transport = oldestMember.getTransport(oldestMember);
        if (transport === undefined) {
          logger.warn(
            `Oldest member: ${oldestMember.userId}|${oldestMember.deviceId}|${oldestMember.memberId} has no transport`,
          );
          return null;
        }
        if (!isLivekitTransportConfig(transport)) {
          logger.warn(
            `Oldest member: ${oldestMember.userId}|${oldestMember.deviceId}|${oldestMember.memberId} has invalid transport`,
          );
          return null;
        }
        logger.info(
          "Oldest member: ${oldestMember.userId}|${oldestMember.deviceId}|${oldestMember.memberId} has valid transport",
        );
        return transport;
      }),
      distinctUntilChanged(areLivekitTransportsEqual),
    ),
  );

  /**
   * The transport that we would personally prefer to publish on (if not for the
   * transport preferences of others, perhaps). `null` until fetched and
   * validated.
   *
   * @throws MatrixRTCTransportMissingError | FailToGetOpenIdToken
   */
  const preferredTransport$ =
    scope.behavior<LocalTransportWithSFUConfig | null>(
      // preferredTransport$ (used for multi sfu) needs to know if we are using the old or new
      // jwt endpoint (`get_token` vs `sfu/get`) based on that the jwt endpoint will compute the rtcBackendIdentity
      // differently. (sha(`${userId}|${deviceId}|${memberId}`) vs `${userId}|${deviceId}|${memberId}`)
      // When using sticky events (we need to use the new endpoint).
      customLivekitUrl.value$.pipe(
        switchMap((customUrl) =>
          startWith<LocalTransportWithSFUConfig | null>(null)(
            // Fetch the SFU config, and repeat this asynchronously for every
            // change in delay ID.
            delayId$.pipe(
              switchMap(async (delayId) => {
                logger.info(
                  "Creating preferred transport based on: ",
                  "customUrl: ",
                  customUrl,
                  "delayId: ",
                  delayId,
                  "forceJwtEndpoint: ",
                  forceJwtEndpoint,
                );
                return makeTransport(
                  client,
                  ownMembershipIdentity,
                  roomId,
                  customUrl,
                  forceJwtEndpoint,
                  delayId ?? undefined,
                );
              }),
              // We deliberately hide any changes to the SFU config because we
              // do not actually want the app to reconnect whenever the JWT
              // token changes due to us delegating a new delayed event. The
              // initial SFU config for the transport is all the app needs.
              distinctUntilChanged((prev, next) =>
                areLivekitTransportsEqual(prev.transport, next.transport),
              ),
            ),
          ),
        ),
      ),
    );

  if (useOldestMember) {
    // --- Oldest member mode ---
    return {
      // Never update the transport that we advertise in our membership. Just
      // take the first valid oldest member or preferred transport that we learn
      // about, and stick with that. This avoids unnecessary SFU hops and room
      // state changes.
      advertised$: scope.behavior(
        merge(
          oldestMemberTransport$,
          preferredTransport$.pipe(map((t) => t?.transport ?? null)),
        ).pipe(
          first((t) => t !== null),
          tap((t) =>
            logger.info(`Advertise transport: ${t.livekit_service_url}`),
          ),
        ),
        null,
      ),
      // Publish on the transport used by the oldest member.
      active$: scope.behavior(
        oldestMemberTransport$.pipe(
          switchMap((transport) => {
            // Oldest member not available (or invalid SFU config).
            if (transport === null) return of(null);
            // Oldest member available: fetch the SFU config.
            const fetchOldestMemberTransport =
              async (): Promise<LocalTransportWithSFUConfig> => ({
                transport,
                sfuConfig: await getSFUConfigWithOpenID(
                  client,
                  ownMembershipIdentity,
                  transport.livekit_service_url,
                  roomId,
                  { forceJwtEndpoint: JwtEndpointVersion.Legacy },
                  logger,
                ),
              });
            return from(fetchOldestMemberTransport()).pipe(startWith(null));
          }),
          tap((t) =>
            logger.info(
              `Publish on transport: ${t?.transport.livekit_service_url}`,
            ),
          ),
        ),
      ),
    };
  }

  // --- Multi-SFU mode ---
  // Always publish on and advertise the preferred transport.
  return {
    advertised$: scope.behavior(
      preferredTransport$.pipe(
        map((t) => t?.transport ?? null),
        distinctUntilChanged(areLivekitTransportsEqual),
      ),
    ),
    active$: preferredTransport$,
  };
};

const FOCI_WK_KEY = "org.matrix.msc4143.rtc_foci";

/**
 * Determine the correct Transport for the current session, including
 * validating auth against the service to ensure it's correct.
 * Prefers in order:
 *

 * 1. The `urlFromDevSettings` value. If this cannot be validated, the function will throw.
 * 2. The transports returned via the homeserver.
 * 3. The transports returned via .well-known.
 * 4. The transport configured in Element Call's config.
 *
 * @param client The authenticated Matrix client for the current user
 * @param membership The membership identity of the user.
 * @param roomId The ID of the room to be connected to.
 * @param urlFromDevSettings Override URL provided by the user's local config.
 * @param forceJwtEndpoint Whether to force a specific JWT endpoint
 *  - `Legacy` / `Matrix_2_0`
 *  - `get_token` / `sfu/get`
 *  -  not hashing / hashing the backendIdentity
 * @param delayId the delay id passed to the jwt service.
 *
 * @returns A fully validated transport config.
 * @throws MatrixRTCTransportMissingError | FailToGetOpenIdToken
 */
async function makeTransport(
  client: Pick<
    MatrixClient,
    "getDomain" | "baseUrl" | "_unstable_getRTCTransports" | "getAccessToken"
  > &
    OpenIDClientParts,
  membership: CallMembershipIdentityParts,
  roomId: string,
  urlFromDevSettings: string | null,
  forceJwtEndpoint: JwtEndpointVersion,
  delayId?: string,
): Promise<LocalTransportWithSFUConfig> {
  logger.trace("Searching for a preferred transport");

  async function doOpenIdAndJWTFromUrl(
    url: string,
  ): Promise<LocalTransportWithSFUConfig> {
    const sfuConfig = await getSFUConfigWithOpenID(
      client,
      membership,
      url,
      roomId,
      {
        forceJwtEndpoint: forceJwtEndpoint,
        delayEndpointBaseUrl: client.baseUrl,
        delayId,
      },
      logger,
    );
    return {
      transport: {
        type: "livekit",
        livekit_service_url: url,
      },
      sfuConfig,
    };
  }
  // We will call `getSFUConfigWithOpenID` once per transport here as it's our
  // only mechanism of valiation. This means we will also ask the
  // homeserver for a OpenID token a few times. Since OpenID tokens are single
  // use we don't want to risk any issues by re-using a token.
  //
  // If the OpenID request were to fail then it's acceptable for us to fail
  // this function early, as we assume the homeserver has got some problems.

  // DEVTOOL: Highest priority: Load from devtool setting
  if (urlFromDevSettings !== null) {
    // Validate that the SFU is up. Otherwise, we want to fail on this
    // as we don't permit other SFUs.
    // This will call the jwt/sfu/get endpoint to pre create the livekit room.
    logger.info("Using LiveKit transport from dev tools: ", urlFromDevSettings);
    return await doOpenIdAndJWTFromUrl(urlFromDevSettings);
  }

  async function getFirstUsableTransport(
    transports: Transport[],
  ): Promise<LocalTransportWithSFUConfig | null> {
    for (const potentialTransport of transports) {
      if (isLivekitTransportConfig(potentialTransport)) {
        try {
          logger.info(
            `makeTransport: check transport authentication for "${potentialTransport.livekit_service_url}"`,
          );
          // This will call the jwt/sfu/get endpoint to pre create the livekit room.
          return await doOpenIdAndJWTFromUrl(
            potentialTransport.livekit_service_url,
          );
        } catch (ex) {
          logger.debug(
            `makeTransport: Could not use SFU service "${potentialTransport.livekit_service_url}" as SFU`,
            ex,
          );
          // Explictly throw these
          if (ex instanceof FailToGetOpenIdToken) {
            throw ex;
          }
          if (ex instanceof NoMatrix2AuthorizationService) {
            throw ex;
          }
        }
      } else {
        logger.info(
          `makeTransport: "${potentialTransport.livekit_service_url}" is not a valid livekit transport  as SFU`,
        );
      }
    }
    return null;
  }

  // MSC4143: Attempt to fetch transports from backend.
  // TODO: Workaround for an issue in the js-sdk RoomWidgetClient that
  // is not yet implementing _unstable_getRTCTransports properly (via widget API new action).
  // For now we just skip this call if we are in a widget.
  // In widget mode the client is a `RoomWidgetClient` which has no access token (it is using the widget API).
  // Could be removed once the js-sdk is fixed (https://github.com/matrix-org/matrix-js-sdk/issues/5245)
  const isSPA = !!client.getAccessToken();
  if (isSPA && "_unstable_getRTCTransports" in client) {
    logger.info(
      "makeTransport: First try to use getRTCTransports end point ...",
    );
    try {
      // TODO This should also check for server support?
      const transportList = await client._unstable_getRTCTransports();
      const selectedTransport = await getFirstUsableTransport(transportList);
      if (selectedTransport) {
        logger.info(
          "makeTransport: ...Using backend-configured (client.getRTCTransports) SFU",
          selectedTransport,
        );
        return selectedTransport;
      }
    } catch (ex) {
      if (ex instanceof MatrixError && ex.httpStatus === 404) {
        // Expected, this is an unstable endpoint and it's not required.
        // There will be expected 404 errors in the console. When we check if synapse supports the endpoint.
        logger.debug(
          "Matrix homeserver does not provide any RTC transports via `/rtc/transports` (will retry with well-known.)",
        );
      } else if (ex instanceof FailToGetOpenIdToken) {
        throw ex;
      } else {
        // We got an error that wasn't just missing support for the feature, so log it loudly.
        logger.error(
          "Unexpected error fetching RTC transports from backend",
          ex,
        );
      }
    }
  }

  logger.info(
    `makeTransport: Trying to get transports from .well-known/matrix/client on domain ${client.getDomain()} ...`,
  );

  // Legacy MSC4143 (to be removed) WELL_KNOWN: Prioritize the .well-known/matrix/client, if available.
  const domain = client.getDomain();
  if (domain) {
    // we use AutoDiscovery instead of relying on the MatrixClient having already
    // been fully configured and started
    const wellKnownFoci = (await AutoDiscovery.getRawClientConfig(domain))?.[
      FOCI_WK_KEY
    ];
    const selectedTransport = Array.isArray(wellKnownFoci)
      ? await getFirstUsableTransport(wellKnownFoci)
      : null;
    if (selectedTransport) {
      logger.info("Using .well-known SFU", selectedTransport);
      return selectedTransport;
    }
  }

  logger.info(
    `makeTransport: No valid transport found via backend or .well-known, falling back to config if available.`,
  );

  // CONFIG: Least prioritized; Load from config file
  const urlFromConf = Config.get().livekit?.livekit_service_url;
  if (urlFromConf) {
    try {
      // This will call the jwt/sfu/get endpoint to pre create the livekit room.
      logger.info("Using config SFU", urlFromConf);
      return await doOpenIdAndJWTFromUrl(urlFromConf);
    } catch (ex) {
      if (ex instanceof FailToGetOpenIdToken) {
        throw ex;
      }
      logger.error("Failed to validate config SFU", ex);
    }
  }

  // If we do not have returned a transport by now we throw an error
  throw new MatrixRTCTransportMissingError(domain ?? "");
}

/*
Copyright 2025 Element Creations Ltd.

SPDX-License-IdFentifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type CallMembership,
  isLivekitTransport,
  type LivekitTransport,
  isLivekitTransportConfig,
  type Transport,
} from "matrix-js-sdk/lib/matrixrtc";
import { MatrixError, type MatrixClient } from "matrix-js-sdk";
import {
  combineLatest,
  distinctUntilChanged,
  first,
  from,
  map,
  switchMap,
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
    "getDomain" | "baseUrl" | "_unstable_getRTCTransports"
  > &
    OpenIDClientParts;
  roomId: string;
  useOldestMember$: Behavior<boolean>;
  forceJwtEndpoint$: Behavior<JwtEndpointVersion>;
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
  transport: LivekitTransport;
  sfuConfig: SFUConfig;
}
export function isLocalTransportWithSFUConfig(
  obj: LivekitTransport | LocalTransportWithSFUConfig,
): obj is LocalTransportWithSFUConfig {
  return "transport" in obj && "sfuConfig" in obj;
}

/**
 * This class is responsible for managing the local transport.
 * "Which transport is the local member going to use"
 *
 * @prop useOldestMember Whether to use the same transport as the oldest member.
 * This will only update once the first oldest member appears. Will not recompute if the oldest member leaves.
 *
 * @prop useOldJwtEndpoint$ Whether to set forceOldJwtEndpoint on the returned transport and to use the old JWT endpoint.
 * This is used when the connection manager needs to know if it has to use the legacy endpoint which implies a string concatenated rtcBackendIdentity.
 * (which is expected for non sticky event based rtc member events)
 * @returns The local transport. It will be created using the correct sfu endpoint based on the useOldJwtEndpoint$ value.
 * @throws MatrixRTCTransportMissingError | FailToGetOpenIdToken
 */
export const createLocalTransport$ = ({
  scope,
  memberships$,
  ownMembershipIdentity,
  client,
  roomId,
  useOldestMember$,
  forceJwtEndpoint$,
  delayId$,
}: Props): Behavior<LocalTransportWithSFUConfig | null> => {
  /**
   * The transport over which we should be actively publishing our media.
   * undefined when not joined.
   */
  const oldestMemberTransport$ = scope.behavior(
    combineLatest([memberships$]).pipe(
      map(([memberships]) => {
        const oldestMember = memberships.value[0];
        const transport = oldestMember?.getTransport(memberships.value[0]);
        if (!transport) return null;
        return transport;
      }),
      first((t) => t != null && isLivekitTransport(t)),
      switchMap((transport) => {
        // Get the open jwt token to connect to the sfu
        const computeLocalTransportWithSFUConfig =
          async (): Promise<LocalTransportWithSFUConfig> => {
            return {
              transport,
              sfuConfig: await getSFUConfigWithOpenID(
                client,
                ownMembershipIdentity,
                transport.livekit_service_url,
                roomId,
                { forceJwtEndpoint: JwtEndpointVersion.Legacy },
                logger,
              ),
            };
          };
        return from(computeLocalTransportWithSFUConfig());
      }),
    ),
    null,
  );

  /**
   * The transport that we would personally prefer to publish on (if not for the
   * transport preferences of others, perhaps).
   *
   * @throws MatrixRTCTransportMissingError | FailToGetOpenIdToken
   */
  const preferredTransport$ = scope.behavior(
    // preferredTransport$ (used for multi sfu) needs to know if we are using the old or new
    // jwt endpoint (`get_token` vs `sfu/get`) based on that the jwt endpoint will compute the rtcBackendIdentity
    // differently. (sha(`${userId}|${deviceId}|${memberId}`) vs `${userId}|${deviceId}|${memberId}`)
    // When using sticky events (we need to use the new endpoint).
    combineLatest([customLivekitUrl.value$, delayId$, forceJwtEndpoint$]).pipe(
      switchMap(([customUrl, delayId, forceEndpoint]) => {
        logger.info(
          "Creating preferred transport based on: ",
          customUrl,
          delayId,
          forceEndpoint,
        );
        return from(
          makeTransport(
            client,
            ownMembershipIdentity,
            roomId,
            customUrl,
            forceEndpoint,
            delayId ?? undefined,
          ),
        );
      }),
    ),
    null,
  );

  /**
   * The chosen transport we should advertise in our MatrixRTC membership.
   */
  return scope.behavior(
    combineLatest([
      useOldestMember$,
      oldestMemberTransport$,
      preferredTransport$,
    ]).pipe(
      map(([useOldestMember, oldestMemberTransport, preferredTransport]) =>
        useOldestMember
          ? (oldestMemberTransport ?? preferredTransport)
          : preferredTransport,
      ),
      distinctUntilChanged((t1, t2) =>
        areLivekitTransportsEqual(t1?.transport ?? null, t2?.transport ?? null),
      ),
    ),
  );
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
    "getDomain" | "baseUrl" | "_unstable_getRTCTransports"
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
        // WARNING PLS READ ME!!!
        // This looks unintuitive especially considering that `sfuConfig.livekitAlias` exists.
        // Why do we not use: `livekit_alias: sfuConfig.livekitAlias`
        //
        //  - This is going to be used for sending our state event transport (focus_preferred)
        //  - In sticky events it is expected to NOT send this field at all. The transport is only the `type`, `livekit_service_url`
        //  - If we set it to the hased alias we get from the jwt, we will end up using the hashed alias as the body.roomId field
        //    in v0.16.0. (It will use oldest member transport. It is using the transport.livekit_alias as the body.roomId)
        //
        // TLDR this is a temporal field that allow for comaptibilty but the spec expects it to not exists. (but its existance also does not break anything)
        // It is just named poorly: It was intetended to be the actual alias. But now we do pseudonymys ids so we use a hashed alias.
        livekit_alias: roomId,
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
          // This will call the jwt/sfu/get endpoint to pre create the livekit room.
          return await doOpenIdAndJWTFromUrl(
            potentialTransport.livekit_service_url,
          );
        } catch (ex) {
          // Explictly throw these
          if (ex instanceof FailToGetOpenIdToken) {
            throw ex;
          }
          if (ex instanceof NoMatrix2AuthorizationService) {
            throw ex;
          }
          logger.debug(
            `Could not use SFU service "${potentialTransport.livekit_service_url}" as SFU`,
            ex,
          );
        }
      }
    }
    return null;
  }

  // MSC4143: Attempt to fetch transports from backend.
  if ("_unstable_getRTCTransports" in client) {
    try {
      const transportList = await client._unstable_getRTCTransports();
      const selectedTransport = await getFirstUsableTransport(transportList);
      if (selectedTransport) {
        logger.info(
          "Using backend-configured (client.getRTCTransports) SFU",
          selectedTransport,
        );
        return selectedTransport;
      }
    } catch (ex) {
      if (ex instanceof MatrixError && ex.httpStatus === 404) {
        // Expected, this is an unstable endpoint and it's not required.
        logger.debug(
          "Backend does not provide any RTC transports (will retry with well-known.)",
          "Your server admin needs to update the matrix homeserver.",
          "(The 404 erros in the console above are expectet to check if synapse supports the endpoint.)",
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

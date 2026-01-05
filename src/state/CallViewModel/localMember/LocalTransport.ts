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
} from "../../../utils/errors.ts";
import {
  getSFUConfigWithOpenID,
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
  useOldJwtEndpoint$: Behavior<boolean>;
  delayId$: Behavior<string | null>;
}

/**
 * This class is responsible for managing the local transport.
 * "Which transport is the local member going to use"
 *
 * @prop useOldestMember Whether to use the same transport as the oldest member.
 * This will only update once the first oldest member appears. Will not recompute if the oldest member leaves.
 *
 * @prop useOldJwtEndpoint$ Whether to set forceOldJwtEndpoint the use the old JWT endpoint.
 * This is used when the connection manager needs to know if it has to use the legacy endpoint which implies a string concatenated rtcBackendIdentity.
 * (which is expected for non sticky event based rtc member events)
 * @returns Behavior<(LivekitTransport & { forceOldJwtEndpoint: boolean }) | null> The `forceOldJwtEndpoint` field is added to let the connection EncryptionManager
 * know that this transport is for the local member and it IS RELEVANT which jwt endpoint to use. (for the local member transport, we need to know which jwt endpoint to use)
 * @throws MatrixRTCTransportMissingError | FailToGetOpenIdToken
 */
export const createLocalTransport$ = ({
  scope,
  memberships$,
  ownMembershipIdentity,
  client,
  roomId,
  useOldestMember$,
  useOldJwtEndpoint$,
  delayId$,
}: Props): Behavior<LivekitTransport | null> => {
  /**
   * The transport over which we should be actively publishing our media.
   * undefined when not joined.
   */
  const oldestMemberTransport$ = scope.behavior(
    combineLatest([memberships$, useOldJwtEndpoint$]).pipe(
      map(([memberships, forceOldJwtEndpoint]) => {
        const oldestMember = memberships.value[0];
        const transport = oldestMember?.getTransport(memberships.value[0]);
        if (!transport) return null;
        return { ...transport, forceOldJwtEndpoint };
      }),
      first((t) => t != null && isLivekitTransport(t)),
    ),
    null,
  );

  /**
   * The transport that we would personally prefer to publish on (if not for the
   * transport preferences of others, perhaps).
   *
   * @throws MatrixRTCTransportMissingError | FailToGetOpenIdToken
   */
  const preferredTransport$: Behavior<LivekitTransport | null> = scope.behavior(
    combineLatest([customLivekitUrl.value$, delayId$, useOldJwtEndpoint$]).pipe(
      switchMap(([customUrl, delayId, forceOldJwtEndpoint]) =>
        from(
          makeTransport(
            client,
            ownMembershipIdentity,
            roomId,
            customUrl,
            forceOldJwtEndpoint,
            delayId ?? undefined,
          ),
        ),
      ),
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
      distinctUntilChanged((t1, t2) => areLivekitTransportsEqual(t1, t2)),
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
 * @param roomId The ID of the room to be connected to.
 * @param urlFromDevSettings Override URL provided by the user's local config.
 * @param useMatrix2 This implies using the matrix2 jwt endpoint (including delayed event delegation of the jwt token)
 * @param delayId
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
  forceOldJwtEndpoint: boolean,
  delayId?: string,
): Promise<LivekitTransport & { forceOldJwtEndpoint: boolean }> {
  logger.trace("Searching for a preferred transport");

  async function doOpenIdAndJWTFromUrl(
    url: string,
  ): Promise<LivekitTransport & { forceOldJwtEndpoint: boolean }> {
    const { livekitAlias } = await getSFUConfigWithOpenID(
      client,
      membership,
      url,
      forceOldJwtEndpoint,
      roomId,
      client.baseUrl,
      delayId,
      logger,
    );
    return {
      type: "livekit",
      livekit_service_url: url,
      livekit_alias: livekitAlias,
      forceOldJwtEndpoint,
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
  ): Promise<(LivekitTransport & { forceOldJwtEndpoint: boolean }) | null> {
    for (const potentialTransport of transports) {
      if (isLivekitTransportConfig(potentialTransport)) {
        try {
          // This will call the jwt/sfu/get endpoint to pre create the livekit room.
          return await doOpenIdAndJWTFromUrl(
            potentialTransport.livekit_service_url,
          );
        } catch (ex) {
          if (ex instanceof FailToGetOpenIdToken) {
            // Explictly throw these
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
      const selectedTransport = await getFirstUsableTransport(
        await client._unstable_getRTCTransports(),
      );
      if (selectedTransport) {
        logger.info("Using backend-configured SFU", selectedTransport);
        return selectedTransport;
      }
    } catch (ex) {
      if (ex instanceof MatrixError && ex.httpStatus === 404) {
        // Expected, this is an unstable endpoint and it's not required.
        logger.debug("Backend does not provide any RTC transports", ex);
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

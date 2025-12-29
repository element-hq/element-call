/*
Copyright 2025 Element Creations Ltd.

SPDX-License-IdFentifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type CallMembership,
  isLivekitTransport,
  type LivekitTransportConfig,
  type LivekitTransport,
  isLivekitTransportConfig,
} from "matrix-js-sdk/lib/matrixrtc";
import { type MatrixClient } from "matrix-js-sdk";
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
import { MatrixRTCTransportMissingError } from "../../../utils/errors.ts";
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
  client: Pick<MatrixClient, "getDomain" | "baseUrl"> & OpenIDClientParts;
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
 *
 * @param client
 * @param roomId
 * @param useMatrix2 This implies using the matrix2 jwt endpoint (including delayed event delegation of the jwt token)
 * @param delayId
 * @returns
 * @throws MatrixRTCTransportMissingError | FailToGetOpenIdToken
 */
async function makeTransport(
  client: Pick<MatrixClient, "getDomain" | "baseUrl"> & OpenIDClientParts,
  membership: CallMembershipIdentityParts,
  roomId: string,
  urlFromDevSettings: string | null,
  forceOldJwtEndpoint: boolean,
  delayId?: string,
): Promise<LivekitTransport & { forceOldJwtEndpoint: boolean }> {
  let transport: LivekitTransport | undefined;
  logger.trace("Searching for a preferred transport");
  //TODO refactor this to use the jwt service returned alias.
  const livekitAlias = roomId;

  // DEVTOOL: Highest priority: Load from devtool setting
  if (urlFromDevSettings !== null) {
    const transportFromStorage: LivekitTransport = {
      type: "livekit",
      livekit_service_url: urlFromDevSettings,
      livekit_alias: livekitAlias,
    };
    logger.info(
      "Using LiveKit transport from dev tools: ",
      transportFromStorage,
    );
    transport = transportFromStorage;
  }

  // WELL_KNOWN: Prioritize the .well-known/matrix/client, if available, over the configured SFU
  const domain = client.getDomain();
  if (domain && transport === undefined) {
    // we use AutoDiscovery instead of relying on the MatrixClient having already
    // been fully configured and started
    const wellKnownFoci = (await AutoDiscovery.getRawClientConfig(domain))?.[
      FOCI_WK_KEY
    ];
    if (Array.isArray(wellKnownFoci)) {
      const wellKnownTransport: LivekitTransportConfig | undefined =
        wellKnownFoci.find((f) => f && isLivekitTransportConfig(f));
      if (wellKnownTransport !== undefined) {
        logger.info("Using LiveKit transport from .well-known: ", transport);
        transport = { ...wellKnownTransport, livekit_alias: livekitAlias };
      }
    }
  }

  // CONFIG: Least prioritized; Load from config file
  const urlFromConf = Config.get().livekit?.livekit_service_url;
  if (urlFromConf && transport === undefined) {
    const transportFromConf: LivekitTransport = {
      type: "livekit",
      livekit_service_url: urlFromConf,
      livekit_alias: livekitAlias,
    };
    logger.info("Using LiveKit transport from config: ", transportFromConf);
    transport = transportFromConf;
  }

  if (!transport) throw new MatrixRTCTransportMissingError(domain ?? "");

  // this will call the jwt/sfu/get endpoint to pre create the livekit room.
  await getSFUConfigWithOpenID(
    client,
    membership,
    transport.livekit_service_url,
    forceOldJwtEndpoint,
    transport.livekit_alias,
    client.baseUrl,
    delayId,
    logger,
  );

  return { ...transport, forceOldJwtEndpoint };
}

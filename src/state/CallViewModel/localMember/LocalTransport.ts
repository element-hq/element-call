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
import { type LivekitTransportWithVersion } from "../remoteMembers/ConnectionManager.ts";

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
  useMatrix2$: Behavior<boolean>;
  delayId$: Behavior<string | null>;
}

/**
 * This class is responsible for managing the local transport.
 * "Which transport is the local member going to use"
 *
 * @prop useOldestMember Whether to use the same transport as the oldest member.
 * This will only update once the first oldest member appears. Will not recompute if the oldest member leaves.
 *
 * @throws MatrixRTCTransportMissingError | FailToGetOpenIdToken
 */
export const createLocalTransport$ = ({
  scope,
  memberships$,
  ownMembershipIdentity,
  client,
  roomId,
  useOldestMember$,
  useMatrix2$,
  delayId$,
}: Props): Behavior<LivekitTransportWithVersion | null> => {
  /**
   * The transport over which we should be actively publishing our media.
   * undefined when not joined.
   */
  const oldestMemberTransport$ = scope.behavior(
    memberships$.pipe(
      map((memberships) => {
        const oldestMember = memberships.value[0];
        const t = oldestMember?.getTransport(memberships.value[0]);
        if (!t) return null;
        // Here we will use the matrix2 information from the oldest member transport.
        return { ...t, useMatrix2: oldestMember.kind === "rtc" };
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
  const preferredTransport$: Behavior<LivekitTransportWithVersion | null> =
    scope.behavior(
      combineLatest([customLivekitUrl.value$, useMatrix2$, delayId$]).pipe(
        switchMap(([customUrl, useMatrix2, delayId]) =>
          from(
            makeTransport(
              client,
              ownMembershipIdentity,
              roomId,
              customUrl,
              useMatrix2,
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
      distinctUntilChanged(areLivekitTransportsEqual),
    ),
  );
};

const FOCI_WK_KEY = "org.matrix.msc4143.rtc_foci";

/**
 *
 * @param client
 * @param roomId
 * @returns
 * @throws MatrixRTCTransportMissingError | FailToGetOpenIdToken
 */
async function makeTransport(
  client: Pick<MatrixClient, "getDomain" | "baseUrl"> & OpenIDClientParts,
  membership: CallMembershipIdentityParts,
  roomId: string,
  urlFromDevSettings: string | null,
  matrix2jwt = false,
  delayId?: string,
): Promise<LivekitTransportWithVersion> {
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
    transport.livekit_alias,
    matrix2jwt,
    client.baseUrl,
    delayId,
  );

  return { ...transport, useMatrix2: matrix2jwt };
}

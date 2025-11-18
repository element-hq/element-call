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
import { combineLatest, distinctUntilChanged, first, from, map } from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";
import { AutoDiscovery } from "matrix-js-sdk/lib/autodiscovery";

import { type Behavior } from "../../Behavior.ts";
import { type Epoch, type ObservableScope } from "../../ObservableScope.ts";
import { Config } from "../../../config/Config.ts";
import { MatrixRTCTransportMissingError } from "../../../utils/errors.ts";
import { getSFUConfigWithOpenID } from "../../../livekit/openIDSFU.ts";
import { areLivekitTransportsEqual } from "../remoteMembers/MatrixLivekitMembers.ts";

/*
 * - get well known
 * - get oldest membership
 * - get transport to use
 * - get openId + jwt token
 * - wait for createTrack() call
 *    - create tracks
 * - wait for join() call
 *   - Publisher.publishTracks()
 *   - send join state/sticky event
 */
interface Props {
  scope: ObservableScope;
  memberships$: Behavior<Epoch<CallMembership[]>>;
  client: MatrixClient;
  roomId: string;
  useOldestMember$: Behavior<boolean>;
}

/**
 * This class is responsible for managing the local transport.
 * "Which transport is the local member going to use"
 *
 * @prop useOldestMember Whether to use the same transport as the oldest member.
 * This will only update once the first oldest member appears. Will not recompute if the oldest member leaves.
 */
export const createLocalTransport$ = ({
  scope,
  memberships$,
  client,
  roomId,
  useOldestMember$,
}: Props): Behavior<LivekitTransport | null> => {
  /**
   * The transport over which we should be actively publishing our media.
   * undefined when not joined.
   */
  const oldestMemberTransport$ = scope.behavior(
    memberships$.pipe(
      map(
        (memberships) =>
          memberships.value[0]?.getTransport(memberships.value[0]) ?? null,
      ),
      first((t) => t != null && isLivekitTransport(t)),
    ),
    null,
  );

  /**
   * The transport that we would personally prefer to publish on (if not for the
   * transport preferences of others, perhaps).
   */
  const preferredTransport$: Behavior<LivekitTransport | null> = scope.behavior(
    from(makeTransport(client, roomId)),
    null,
  );

  /**
   * The transport we should advertise in our MatrixRTC membership.
   */
  const advertisedTransport$ = scope.behavior(
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
  return advertisedTransport$;
};

const FOCI_WK_KEY = "org.matrix.msc4143.rtc_foci";

async function makeTransportInternal(
  client: MatrixClient,
  roomId: string,
): Promise<LivekitTransport> {
  logger.log("Searching for a preferred transport");
  //TODO refactor this to use the jwt service returned alias.
  const livekitAlias = roomId;
  // TODO-MULTI-SFU: Either remove this dev tool or make it more official
  const urlFromStorage =
    localStorage.getItem("robin-matrixrtc-auth") ??
    localStorage.getItem("timo-focus-url");
  if (urlFromStorage !== null) {
    const transportFromStorage: LivekitTransport = {
      type: "livekit",
      livekit_service_url: urlFromStorage,
      livekit_alias: livekitAlias,
    };
    logger.log(
      "Using LiveKit transport from local storage: ",
      transportFromStorage,
    );
    return transportFromStorage;
  }

  // Prioritize the .well-known/matrix/client, if available, over the configured SFU
  const domain = client.getDomain();
  if (domain) {
    // we use AutoDiscovery instead of relying on the MatrixClient having already
    // been fully configured and started
    const wellKnownFoci = (await AutoDiscovery.getRawClientConfig(domain))?.[
      FOCI_WK_KEY
    ];
    if (Array.isArray(wellKnownFoci)) {
      const transport: LivekitTransportConfig | undefined = wellKnownFoci.find(
        (f) => f && isLivekitTransportConfig(f),
      );
      if (transport !== undefined) {
        logger.log("Using LiveKit transport from .well-known: ", transport);
        return { ...transport, livekit_alias: livekitAlias };
      }
    }
  }

  const urlFromConf = Config.get().livekit?.livekit_service_url;
  if (urlFromConf) {
    const transportFromConf: LivekitTransport = {
      type: "livekit",
      livekit_service_url: urlFromConf,
      livekit_alias: livekitAlias,
    };
    logger.log("Using LiveKit transport from config: ", transportFromConf);
    return transportFromConf;
  }

  throw new MatrixRTCTransportMissingError(domain ?? "");
}

async function makeTransport(
  client: MatrixClient,
  roomId: string,
): Promise<LivekitTransport> {
  const transport = await makeTransportInternal(client, roomId);
  // this will call the jwt/sfu/get endpoint to pre create the livekit room.
  try {
    await getSFUConfigWithOpenID(
      client,
      transport.livekit_service_url,
      transport.livekit_alias,
    );
  } catch (e) {
    logger.warn(`Failed to get SFU config for transport: ${e}`);
  }
  return transport;
}

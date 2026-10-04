/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixClient } from "matrix-js-sdk";
import { type Logger } from "matrix-js-sdk/lib/logger";
import {
  isLivekitTransport,
  type LivekitTransport,
  type Transport,
} from "matrix-js-sdk/lib/matrixrtc";
import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  map,
  type Observable,
  of,
  ReplaySubject,
  switchMap,
} from "rxjs";

import {
  type MemberMedia,
  type ResolvedTransport,
  type RTCMembership,
} from "../../api";
import { type MediaQuality } from "../../config";
import { MatrixRTCError } from "../../errors";
import { type Behavior } from "../../reactive/Behavior";
import {
  type Epoch,
  type ObservableScope,
  trackEpoch,
} from "../../reactive/ObservableScope";
import { mapScoped } from "../../utils/mapScoped";
import {
  type BackendConnection,
  type MediaBackend,
  type MediaBackendContext,
  type TransportCapabilities,
} from "../api";
import { type Connection } from "./Connection";
import {
  LivekitConnectionFactory,
  ResolvedConnection,
} from "./ConnectionFactory";
import {
  createConnectionManager$,
  type LocalTransport,
} from "./ConnectionManager";
import { toMediaConnectionState } from "./connectionState";
import { createDataChannel$ } from "./DataChannel";
import { createKeyProvider } from "./KeyProvider";
import { createLivekitMemberMedia } from "./LivekitMemberMedia";
import { createLivekitLocalMedia } from "./LocalMedia";
import { getSFUConfigWithOpenID, type TokenEndpoint } from "./openIDSFU";

export interface LivekitBackendOptions {
  /** `getOpenIdToken` for the token exchange, `baseUrl` for the delegation probe and handover. */
  client: Pick<MatrixClient, "getOpenIdToken" | "baseUrl">;
  mediaQuality?: MediaQuality;
  /** Which token service endpoint the local transport uses; remote ones try both. */
  tokenEndpoint: TokenEndpoint;
}

/**
 * MatrixRTC media over LiveKit SFUs: one room per transport, the local one
 * published on, every remote one subscribed to, with the token service
 * protocol in front of each.
 */
export function createLivekitBackend(
  scope: ObservableScope,
  {
    roomId,
    ownMembershipIdentity,
    localMedia,
    encryptionSystem,
    mediaKeys$,
    timings,
    logger: parentLogger,
  }: MediaBackendContext,
  { client, mediaQuality, tokenEndpoint }: LivekitBackendOptions,
): MediaBackend {
  const logger = parentLogger.getChild("[LivekitBackend]");
  const keyProvider = createKeyProvider(encryptionSystem, mediaKeys$, logger);
  const transports = createTransportRegistry(scope);
  const localTransport$ = new ReplaySubject<LocalTransport>(1);

  const connectionManager = createConnectionManager$({
    scope,
    connectionFactory: new LivekitConnectionFactory(
      client,
      roomId,
      localMedia,
      keyProvider,
      mediaQuality,
    ),
    localTransport$,
    remoteTransports$: transports.transports$,
    logger,
    ownMembershipIdentity,
  });

  let local: LivekitTransport | undefined;
  const prepareLocalTransport = async (
    transport: Transport,
  ): Promise<TransportCapabilities> => {
    if (!isLivekitTransport(transport))
      throw new MatrixRTCError(`Not a LiveKit transport: ${transport.type}`);
    const [sfuConfig, canDelegateDelayedLeave] = await Promise.all([
      getSFUConfigWithOpenID(
        client,
        ownMembershipIdentity,
        transport.livekit_service_url,
        roomId,
        { tokenEndpoint },
        logger,
      ),
      supportsDelegation(client.baseUrl, transport, logger),
    ]);
    local = transport;
    localTransport$.next({ transport, sfuConfig });
    return { canDelegateDelayedLeave };
  };

  // The token this issues is discarded; the request is what hands the leave over
  const delegateDelayedLeave = async (delayId: string): Promise<void> => {
    if (local === undefined)
      throw new MatrixRTCError("No local transport to delegate the leave to");
    await getSFUConfigWithOpenID(
      client,
      ownMembershipIdentity,
      local.livekit_service_url,
      roomId,
      {
        tokenEndpoint,
        delayEndpointBaseUrl: client.baseUrl,
        delayId,
        delayTimeoutMs: timings.delegatedDelayedLeave.delay_ms,
      },
      logger,
    );
  };

  const mediaFor$ = (
    memberScope: ObservableScope,
    membership$: Behavior<RTCMembership>,
  ): Behavior<MemberMedia | null> => {
    const identity = membership$.value.rtcBackendIdentity;
    const transport$ = memberScope.behavior(
      membership$.pipe(
        map((membership) => membership.getTransport()),
        map((transport) =>
          isLivekitTransport(transport) ? transport : undefined,
        ),
        distinctUntilChanged(
          (a, b) => a?.livekit_service_url === b?.livekit_service_url,
        ),
      ),
    );
    transports.follow(memberScope, transport$);

    const source$ = memberScope.behavior(
      combineLatest([
        transport$,
        connectionManager.connectionManagerData$,
      ]).pipe(
        map(([transport, { value: connections }]) => {
          if (transport === undefined) return null;
          const connection = connections.getConnectionForTransport(transport);
          const participant = connections
            .getParticipantsForTransport(transport)
            .find((p) => p.identity === identity);
          return connection && participant
            ? { participant, room: connection.livekitRoom }
            : null;
        }),
        distinctUntilChanged(
          (a, b) => a?.participant === b?.participant && a?.room === b?.room,
        ),
      ),
    );
    source$.pipe(memberScope.bind()).subscribe((source) => {
      logger.info(
        `${identity}: LiveKit participant ${source ? `matched (${source.participant.sid})` : "missing"}`,
      );
    });
    return memberScope.behavior(
      mapScoped(memberScope, source$, (mediaScope, { participant, room }) =>
        createLivekitMemberMedia(
          mediaScope,
          participant,
          room,
          encryptionSystem,
        ),
      ).pipe(map((media) => media ?? null)),
    );
  };

  const connections$ = scope.behavior<BackendConnection[]>(
    connectionManager.connectionManagerData$.pipe(
      switchMap(({ value }) => {
        const connections = value.getConnections();
        if (connections.length === 0) return of([]);
        return combineLatest(connections.map(backendConnection$));
      }),
    ),
  );

  const localMedia_ = createLivekitLocalMedia({
    scope,
    connectionManager,
    localTransport$,
    localMedia,
    encryptionSystem,
    logger,
  });

  const { data$, sendData } = createDataChannel$({
    scope,
    connectionManager,
    connection$: localMedia_.connection$,
  });

  return {
    transportType: "livekit",
    prepareLocalTransport,
    delegateDelayedLeave,
    local: localMedia_,
    mediaFor$,
    connections$,
    sendData,
    data$,
  };
}

function backendConnection$(
  connection: Connection,
): Observable<BackendConnection> {
  const resolved$: Observable<ResolvedTransport | undefined> =
    connection instanceof ResolvedConnection
      ? connection.resolved$
      : of(undefined);
  return combineLatest([connection.state$, resolved$]).pipe(
    map(([state, resolved]): BackendConnection => ({
      transport: connection.transport,
      state: toMediaConnectionState(state),
      resolved,
    })),
  );
}

export interface TransportRegistry {
  /** Keeps a member's transport registered for as long as its scope lives. */
  follow(
    scope: ObservableScope,
    transport$: Behavior<LivekitTransport | undefined>,
  ): void;
  /** Every transport some member is on, for the connection manager. */
  transports$: Behavior<Epoch<LivekitTransport[]>>;
}

/**
 * The remote transports to connect to, counted per member so that a transport
 * stays while any member names it. A release after the scope has ended only
 * touches the map, so it is safe in any order of teardown.
 */
export function createTransportRegistry(
  scope: ObservableScope,
): TransportRegistry {
  const counts = new Map<
    string,
    { transport: LivekitTransport; count: number }
  >();
  const transports = new BehaviorSubject<LivekitTransport[]>([]);
  const publish = (): void =>
    transports.next([...counts.values()].map(({ transport }) => transport));

  const register = (transport: LivekitTransport): (() => void) => {
    const url = transport.livekit_service_url;
    const entry = counts.get(url) ?? { transport, count: 0 };
    entry.count++;
    if (entry.count === 1) {
      counts.set(url, entry);
      publish();
    }
    return () => {
      if (--entry.count > 0) return;
      counts.delete(url);
      publish();
    };
  };

  return {
    follow: (memberScope, transport$) => {
      let release: (() => void) | undefined;
      transport$.pipe(memberScope.bind()).subscribe((transport) => {
        release?.();
        release = transport && register(transport);
      });
      memberScope.onEnd(() => release?.());
    },
    transports$: scope.behavior(transports.pipe(trackEpoch())),
  };
}

/**
 * Whether the SFU can take over restarting the delayed leave. Either the
 * homeserver or the transport has to support it. Each endpoint is hit without
 * credentials and read for a 404, not retried: many servers predate the
 * endpoint altogether and answer with a CORS failure that a retry loop would
 * only repeat.
 */
export async function supportsDelegation(
  homeserverUrl: string,
  transport: LivekitTransport,
  logger: Logger,
): Promise<boolean> {
  const [homeserver, sfu] = await Promise.all([
    endpointExists(
      `${homeserverUrl}/_matrix/client/unstable/io.element.msc4195/rtc/livekit/delegate_delayed_leave`,
      "homeserver",
      logger,
    ),
    endpointExists(
      `${transport.livekit_service_url}/delegate_delayed_leave`,
      `transport ${transport.livekit_service_url}`,
      logger,
    ),
  ]);
  return homeserver || sfu;
}

async function endpointExists(
  url: string,
  serviceName: string,
  logger: Logger,
): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "POST" });
    const supported = res.status !== 404;
    logger.info(
      `${serviceName} ${supported ? "supports" : "does not support"} delegation`,
    );
    return supported;
  } catch (e) {
    logger.warn(
      `Failed to determine whether ${serviceName} supports delegation, assuming no support`,
      e,
    );
    return false;
  }
}

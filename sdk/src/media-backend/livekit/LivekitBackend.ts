/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixClient } from "matrix-js-sdk";
import { type Logger } from "matrix-js-sdk/lib/logger";
import {
  isUnstableLivekitTransport,
  type Transport,
} from "matrix-js-sdk/lib/matrixrtc";
import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  filter,
  firstValueFrom,
  map,
  type Observable,
  of,
  switchMap,
} from "rxjs";

import { type ResolvedTransport, type RTCMember } from "../../api";
import { type MediaQuality } from "../../config";
import { MatrixRTCError } from "../../errors";
import { type MemberMedia } from "../../media-api";
import { type Behavior } from "../../reactive/Behavior";
import {
  Epoch,
  type ObservableScope,
  trackEpoch,
} from "../../reactive/ObservableScope";
import { mapScoped } from "../../utils/mapScoped";
import { serverNameOf, serverNameOfTransport } from "../../utils/serverName";
import {
  type BackendConnection,
  type MediaBackend,
  type MediaBackendContext,
  type TransportCapabilities,
} from "../api";
import {
  chooseAuthFlow,
  delegateDelayedLeave,
  type TransportLocator,
} from "./auth";
import { type Connection } from "./Connection";
import {
  ConnectionMap,
  createConnectionMap$,
  keyFor,
  type TransportKey,
} from "./ConnectionMap";
import {
  LivekitConnectionFactory,
  ResolvedConnection,
} from "./ConnectionFactory";
import { toMediaConnectionState } from "./connectionState";
import { createDataChannel$ } from "./DataChannel";
import { createKeyProvider } from "./KeyProvider";
import {
  createLivekitMemberMedia,
  participantSourcesEqual,
} from "./LivekitMemberMedia";
import { createLivekitLocalMedia } from "./LocalMedia";

export interface LivekitBackendOptions {
  /**
   * `getOpenIdToken` for the JWT service flow, the MSC4195 methods for the
   * client-server API flow, `baseUrl` for the delegation probe and handover.
   */
  client: Pick<
    MatrixClient,
    | "getOpenIdToken"
    | "_unstable_getLivekitToken"
    | "_unstable_delegateDelayedLeave"
    | "baseUrl"
  >;
  mediaQuality?: MediaQuality;
}

/**
 * MatrixRTC media over LiveKit SFUs: one room per transport, the local one
 * published on, every remote one subscribed to, each authenticated for its
 * role through the homeserver or the transport's JWT service.
 */
export function createLivekitBackend(
  scope: ObservableScope,
  {
    roomId,
    slotId,
    ownMembershipIdentity,
    publish,
    encryptionSystem,
    mediaKeys$,
    timings,
    logger: parentLogger,
  }: MediaBackendContext,
  { client, mediaQuality }: LivekitBackendOptions,
): MediaBackend {
  const logger = parentLogger.getChild("[LivekitBackend]");
  const keyProvider = createKeyProvider(encryptionSystem, mediaKeys$, logger);
  const transports = createTransportRegistry(scope);
  const localTransport$ = new BehaviorSubject<TransportLocator | null>(null);
  const audioOutputDeviceId$ = new BehaviorSubject<string | undefined>(
    undefined,
  );
  const connectionFactory = new LivekitConnectionFactory(
    client,
    roomId,
    slotId,
    publish,
    audioOutputDeviceId$,
    keyProvider,
    mediaQuality,
  );

  // A new map, in a scope of its own, whenever the local transport changes:
  // the publisher role sits on one connection, and which one is fixed per map
  const connectionMap$ = scope.behavior<Epoch<ConnectionMap>>(
    mapScoped(scope, localTransport$, (mapScope, localTransport) =>
      createConnectionMap$({
        scope: mapScope,
        connectionFactory,
        localTransport,
        remoteTransports$: transports.transports$,
        logger,
        ownMembershipIdentity,
      }),
    ).pipe(switchMap((map$) => map$ ?? of(new Epoch(new ConnectionMap())))),
  );

  const localMedia_ = createLivekitLocalMedia({
    scope,
    connectionMap$,
    localTransport$,
    publish,
    audioOutputDeviceId$,
    encryptionSystem,
    logger,
  });

  // Probed once: the answer cannot change within a session
  const homeserverSupportsDelegation = supportsDelegation(
    `${client.baseUrl}/_matrix/client/unstable/io.element.msc4195/rtc/livekit/delegate_delayed_leave`,
    "homeserver",
    logger,
  );

  const ownServerName = serverNameOf(ownMembershipIdentity.userId);

  const prepareLocalTransport = async (
    transport: Transport,
  ): Promise<TransportCapabilities> => {
    if (!isUnstableLivekitTransport(transport))
      throw new MatrixRTCError(`Not a LiveKit transport: ${transport.type}`);
    const serverName = serverNameOfTransport(
      transport,
      ownMembershipIdentity.userId,
    );
    const locator: TransportLocator = { transport, serverName };
    let canDelegate: Promise<boolean>;
    if (serverName !== ownServerName) {
      // Our homeserver only takes over leaves for its own SFUs
      logger.info(
        `Publishing on a remote SFU of ${serverName}, delegation is not possible`,
      );
      canDelegate = Promise.resolve(false);
    } else {
      // Check for support using the same auth flow that we intend to use later
      const flow = chooseAuthFlow(transport);
      canDelegate =
        flow.kind === "openID"
          ? supportsDelegation(
              `${flow.serviceUrl}/delegate_delayed_leave`,
              `transport ${flow.serviceUrl}`,
              logger,
            )
          : homeserverSupportsDelegation;
    }
    localTransport$.next(locator);
    // The membership is only sent once the publisher connection holds its
    // token, so that the LiveKit room exists before anyone subscribes to it:
    // a subscriber lacks the permission to create it and would fail without
    // retrying
    const [, canDelegateDelayedLeave] = await Promise.all([
      authenticated(localMedia_.connection$),
      canDelegate,
    ]);
    return { canDelegateDelayedLeave };
  };

  const delegateLeave = async (delayId: string): Promise<void> => {
    const local = localTransport$.value;
    if (local === null)
      throw new MatrixRTCError("No local transport to delegate the leave to");
    await delegateDelayedLeave({
      client,
      membership: ownMembershipIdentity,
      transport: local.transport,
      roomId,
      slotId,
      delayId,
      delayTimeoutMs: timings.delegatedDelayedLeave.delay_ms,
      logger,
    });
  };

  const mediaFor = (
    memberScope: ObservableScope,
    member: RTCMember,
  ): MemberMedia => {
    const { backendIdentities } = member;
    const locator$ = memberScope.behavior(
      member.transport$.pipe(
        map((transport): TransportLocator | undefined => {
          const raw = transport?.raw;
          return isUnstableLivekitTransport(raw)
            ? {
                transport: raw,
                serverName: serverNameOfTransport(raw, member.userId),
              }
            : undefined;
        }),
        distinctUntilChanged((a, b) => (a && keyFor(a)) === (b && keyFor(b))),
      ),
    );
    transports.follow(memberScope, locator$);

    const source$ = memberScope.behavior(
      combineLatest([locator$, connectionMap$]).pipe(
        map(([locator, { value: connections }]) => {
          if (locator === undefined) return null;
          const connection = connections.getConnectionForTransport(locator);
          // A member advertising both a `url` and a `livekit_service_url` may
          // have authenticated through either flow, under either identity
          const participants = connections
            .getParticipantsForTransport(locator)
            .filter((p) => backendIdentities.includes(p.identity));
          return connection && participants.length
            ? { participants, room: connection.livekitRoom }
            : null;
        }),
        distinctUntilChanged(participantSourcesEqual),
      ),
    );
    source$.pipe(memberScope.bind()).subscribe((source) => {
      const transportString = locator$.value
        ? JSON.stringify(locator$.value.transport)
        : "no transport";
      if (source)
        logger.info(
          `${member.rtcBackendIdentity}: ${source.participants.length} LiveKit participant(s) matched (${source.participants.map((p) => p.sid).join(", ")}) on ${transportString}`,
        );
      else
        logger.info(
          `${member.rtcBackendIdentity}: LiveKit participant missing on ${transportString}`,
        );
    });
    return createLivekitMemberMedia(memberScope, source$, encryptionSystem);
  };

  const connections$ = scope.behavior<BackendConnection[]>(
    connectionMap$.pipe(
      switchMap(({ value }) => {
        const connections = value.getConnections();
        if (connections.length === 0) return of([]);
        return combineLatest(connections.map(backendConnection$));
      }),
    ),
  );

  const { data$, sendData } = createDataChannel$({
    scope,
    connectionMap$,
    connection$: localMedia_.connection$,
  });

  return {
    transportTypes: ["m.livekit", "livekit"],
    prepareLocalTransport,
    delegateDelayedLeave: delegateLeave,
    local: localMedia_,
    mediaFor,
    connections$,
    setAudioOutputDeviceId: localMedia_.setAudioOutputDeviceId,
    sendData,
    data$,
  };
}

/** Resolves once the connection holds its token; rejects with its error otherwise. */
async function authenticated(
  connection$: Behavior<Connection | null>,
): Promise<void> {
  const state = await firstValueFrom(
    connection$.pipe(
      switchMap((connection) => connection?.state$ ?? of(null)),
      filter(
        (state) =>
          state !== null &&
          (state.state === "authenticated" ||
            state.state === "error" ||
            state.state === "stopped"),
      ),
    ),
  );
  if (state?.state === "error") throw state.error;
  if (state?.state === "stopped")
    throw new MatrixRTCError(
      "The local connection stopped before it was authenticated",
    );
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
    locator$: Behavior<TransportLocator | undefined>,
  ): void;
  /** Every transport some member is on, for the connection map. */
  transports$: Behavior<Epoch<TransportLocator[]>>;
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
    TransportKey,
    { locator: TransportLocator; count: number }
  >();
  const transports = new BehaviorSubject<TransportLocator[]>([]);
  const publish = (): void =>
    transports.next([...counts.values()].map(({ locator }) => locator));

  const register = (locator: TransportLocator): (() => void) => {
    const key = keyFor(locator);
    const entry = counts.get(key) ?? { locator, count: 0 };
    entry.count++;
    if (entry.count === 1) {
      counts.set(key, entry);
      publish();
    }
    return () => {
      if (--entry.count > 0) return;
      counts.delete(key);
      publish();
    };
  };

  return {
    follow: (memberScope, locator$) => {
      let release: (() => void) | undefined;
      locator$.pipe(memberScope.bind()).subscribe((locator) => {
        release?.();
        release = locator && register(locator);
      });
      memberScope.onEnd(() => release?.());
    },
    transports$: scope.behavior(transports.pipe(trackEpoch())),
  };
}

/**
 * Whether a service can take over restarting the delayed leave. The endpoint
 * is hit without credentials and read for a 404, not retried: many servers
 * predate the endpoint altogether and answer with a CORS failure that a retry
 * loop would only repeat.
 */
export async function supportsDelegation(
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

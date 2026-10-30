/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The full mesh transport (MSCXXXX): one WebRTC connection per subscriber
 * and publisher, signalled over to-device messages, through the TURN server
 * of each side's homeserver. Works subscribe-only too: without
 * `prepareLocalTransport` it publishes nothing and still receives from every
 * member on full mesh.
 */

import { type MatrixClient } from "matrix-js-sdk";
import { type Transport } from "matrix-js-sdk/lib/matrixrtc";
import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  filter,
  firstValueFrom,
  map,
  NEVER,
  type Observable,
  of,
  share,
  Subject,
  switchMap,
  timeout,
} from "rxjs";

import { type RTCMember } from "../../api";
import { MatrixRTCError } from "../../errors";
import { type MemberMedia } from "../../media-api";
import { type Behavior } from "../../reactive/Behavior";
import { ObservableScope } from "../../reactive/ObservableScope";
import { mapScoped } from "../../utils/mapScoped";
import {
  type BackendConnection,
  type DataPacket,
  type MediaBackend,
  type MediaBackendContext,
  MediaConnectionState,
} from "../api";
import { createFullMeshLocalMedia } from "./LocalMedia";
import { type PeerConnectionBase } from "./PeerConnection";
import {
  createPublisherConnection,
  type PublisherConnection,
} from "./PublisherConnection";
import {
  createSignalling,
  FULL_MESH_TRANSPORT_TYPE,
  type Peer,
  type SignallingClient,
  type SignallingMessage,
} from "./signalling";
import {
  createSubscriberConnection,
  type SubscriberConnection,
} from "./SubscriberConnection";

export { FULL_MESH_TRANSPORT_TYPE } from "./signalling";

/** How long a subscribe request waits for the subscriber's membership to arrive. */
const SUBSCRIBE_GRACE_MS = 10_000;

export interface FullMeshBackendOptions {
  client: SignallingClient &
    Pick<MatrixClient, "getTurnServers" | "checkTurnServers">;
}

/**
 * The transport object a member publishing on full mesh advertises: a host
 * passes `{ type: FULL_MESH_TRANSPORT_TYPE }`, and the device is filled in.
 * Any other transport is returned as it is.
 */
export function completeFullMeshTransport(
  transport: Transport,
  deviceId: string,
): Transport {
  return transport.type === FULL_MESH_TRANSPORT_TYPE
    ? { ...transport, device_id: deviceId }
    : transport;
}

export function createFullMeshBackend(
  scope: ObservableScope,
  {
    roomId,
    slotId,
    ownMembershipIdentity,
    publish,
    logger: parentLogger,
  }: MediaBackendContext,
  { client }: FullMeshBackendOptions,
): MediaBackend {
  const logger = parentLogger.getChild("[FullMeshBackend]");
  const signalling = createSignalling({
    scope,
    client,
    roomId,
    slotId,
    own: ownMembershipIdentity,
    logger,
  });

  const iceServers = async (): Promise<RTCIceServer[]> => {
    if (client.getTurnServers().length === 0)
      await client
        .checkTurnServers()
        .catch((e: unknown) => logger.warn("No TURN servers", e));
    return client.getTurnServers().map(({ urls, username, credential }) => ({
      urls,
      username,
      credential,
    }));
  };

  let localTransport: Transport | null = null;
  const prepared$ = new BehaviorSubject(false);
  const audioOutputDeviceId$ = new BehaviorSubject<string | undefined>(
    undefined,
  );

  const data$ = new Subject<DataPacket>();
  scope.onEnd(() => data$.complete());

  const members = new Map<string, RTCMember>();
  const memberAdded$ = new Subject<RTCMember>();
  const subscribers = new Map<
    string,
    { transport: Transport; peer: Peer; connection: SubscriberConnection }
  >();
  const publishers = new Map<
    string,
    { connection: PublisherConnection; peer: Peer; scope: ObservableScope }
  >();
  scope.onEnd(() => {
    for (const { scope: s } of Array.from(publishers.values())) s.end();
  });
  /** The connection id of the newest subscribe request per member. */
  const latestSubscribe = new Map<string, string>();

  // For the developer tools: one entry per publisher we subscribe to, and one
  // for our own transport with every subscriber we send to. `resolved` lists
  // the peer connections, as an SFU's entry lists what it connected to
  const connectionsChanged$ = new BehaviorSubject<void>(undefined);
  const connections$ = scope.behavior<BackendConnection[]>(
    combineLatest([connectionsChanged$, prepared$]).pipe(
      switchMap(([, prepared]) => {
        const entries: Observable<BackendConnection>[] = [];
        for (const { transport, peer, connection } of subscribers.values()) {
          const base = connection.current$.value;
          if (base)
            entries.push(
              base.state$.pipe(
                map((state) => ({
                  transport,
                  state,
                  resolved: {
                    type: FULL_MESH_TRANSPORT_TYPE,
                    role: "subscriber",
                    peerConnections: [describe(peer, base)],
                  },
                })),
              ),
            );
        }
        if (localTransport && prepared) {
          const transport = localTransport;
          const outgoing = [...publishers.values()];
          entries.push(
            (outgoing.length === 0
              ? of([])
              : combineLatest(outgoing.map((p) => p.connection.state$))
            ).pipe(
              map(() => ({
                transport,
                // Publishing needs no server, so it is up once prepared
                state: MediaConnectionState.Connected,
                resolved: {
                  type: FULL_MESH_TRANSPORT_TYPE,
                  role: "publisher",
                  peerConnections: outgoing.map(({ peer, connection }) =>
                    describe(peer, connection),
                  ),
                },
              })),
            ),
          );
        }
        return entries.length === 0 ? of([]) : combineLatest(entries);
      }),
    ),
  );

  const local = createFullMeshLocalMedia({
    scope,
    publish,
    connectionState$: scope.behavior(
      prepared$.pipe(
        map((prepared) =>
          prepared
            ? MediaConnectionState.Connected
            : MediaConnectionState.Initialized,
        ),
      ),
    ),
    peerConnections: () =>
      [...publishers.values()].map(({ connection }) => connection.pc),
    logger,
  });

  const acceptSubscribe = async (message: SignallingMessage): Promise<void> => {
    const peer: Peer = {
      userId: message.userId,
      deviceId: message.deviceId,
      memberId: message.memberId,
    };
    // We don't advertise full mesh, so nobody should have asked
    if (!prepared$.value) {
      signalling.send(peer, message.connectionId, {
        type: "close",
        reason: "not_publishing",
      });
      return;
    }
    latestSubscribe.set(peer.memberId, message.connectionId);
    // The request may overtake the subscriber's membership
    const member =
      members.get(peer.memberId) ??
      (await firstValueFrom(
        memberAdded$.pipe(
          filter((m) => m.memberId === peer.memberId),
          timeout(SUBSCRIBE_GRACE_MS),
        ),
      ).catch(() => undefined));
    if (latestSubscribe.get(peer.memberId) !== message.connectionId) return;
    if (
      member === undefined ||
      member.userId !== peer.userId ||
      member.deviceId !== peer.deviceId
    ) {
      logger.warn(`Rejecting a subscribe from ${peer.memberId}`);
      signalling.send(peer, message.connectionId, {
        type: "close",
        reason: "not_a_member",
      });
      return;
    }
    // At most one connection per member pair: the new one replaces the old
    publishers.get(peer.memberId)?.scope.end();
    const pubScope = new ObservableScope();
    const connection = createPublisherConnection({
      scope: pubScope,
      peer,
      connectionId: message.connectionId,
      signalling,
      iceServers: await iceServers(),
      local,
      logger,
    });
    publishers.set(peer.memberId, { connection, peer, scope: pubScope });
    pubScope.onEnd(() => {
      if (publishers.get(peer.memberId)?.connection === connection) {
        publishers.delete(peer.memberId);
        connectionsChanged$.next();
      }
    });
    connectionsChanged$.next();
  };

  signalling.messages$.pipe(scope.bind()).subscribe((message) => {
    if (message.type === "subscribe") return void acceptSubscribe(message);
    const subscriber = subscribers.get(message.memberId)?.connection;
    if (subscriber?.current$.value?.connectionId === message.connectionId)
      return subscriber.handle(message);
    const publisher = publishers.get(message.memberId)?.connection;
    if (publisher?.connectionId === message.connectionId)
      return publisher.handle(message);
    logger.debug(`Dropping ${message.type} of a stale connection`);
  });

  const mediaFor = (
    memberScope: ObservableScope,
    member: RTCMember,
  ): MemberMedia => {
    members.set(member.memberId, member);
    memberAdded$.next(member);
    memberScope.onEnd(() => {
      members.delete(member.memberId);
      // We stop sending to members that are no longer joined
      publishers.get(member.memberId)?.scope.end();
    });

    // In encrypted rooms the advertised device has to be the one the
    // membership came from
    const fullMesh$ = memberScope.behavior(
      member.transport$.pipe(
        map((transport) =>
          transport?.type === FULL_MESH_TRANSPORT_TYPE &&
          transport.raw.device_id === member.deviceId
            ? transport.raw
            : undefined,
        ),
        distinctUntilChanged((a, b) => a?.device_id === b?.device_id),
      ),
    );
    const subscriber$ = mapScoped(memberScope, fullMesh$, (s, transport) => {
      const connection = createSubscriberConnection({
        scope: s,
        peer: {
          userId: member.userId,
          deviceId: member.deviceId,
          memberId: member.memberId,
        },
        signalling,
        iceServers,
        audioOutputDeviceId$,
        logger,
      });
      subscribers.set(member.memberId, {
        transport,
        peer: {
          userId: member.userId,
          deviceId: member.deviceId,
          memberId: member.memberId,
        },
        connection,
      });
      connection.current$
        .pipe(s.bind())
        .subscribe(() => connectionsChanged$.next());
      connection.data$.pipe(s.bind()).subscribe((message) => {
        const packet = parseDataMessage(message);
        if (packet === null)
          logger.debug(`Ignoring a data message from ${member.memberId}`);
        else data$.next({ senderId: member.rtcBackendIdentity, ...packet });
      });
      s.onEnd(() => {
        subscribers.delete(member.memberId);
        connectionsChanged$.next();
      });
      return connection;
    });

    return {
      tracks$: memberScope.behavior(
        subscriber$.pipe(switchMap((s) => s?.tracks$ ?? of(null))),
      ),
      encryptionError$: NEVER,
    };
  };

  return {
    transportType: FULL_MESH_TRANSPORT_TYPE,
    prepareLocalTransport: async (transport) => {
      if (transport.type !== FULL_MESH_TRANSPORT_TYPE)
        throw new MatrixRTCError(
          `Not a full mesh transport: ${transport.type}`,
        );
      localTransport = transport;
      // Fetched now, so that the first subscriber isn't kept waiting
      await iceServers();
      prepared$.next(true);
      return { canDelegateDelayedLeave: false };
    },
    delegateDelayedLeave: async () =>
      Promise.reject(
        new MatrixRTCError("Full mesh cannot take over the delayed leave"),
      ),
    local,
    mediaFor,
    connections$: connections$ as Behavior<BackendConnection[]>,
    setAudioOutputDeviceId: async (deviceId) => {
      audioOutputDeviceId$.next(deviceId);
      return Promise.resolve();
    },
    sendData: async (topic, text) => {
      if (!prepared$.value)
        throw new MatrixRTCError(
          "Cannot send data: not publishing on full mesh",
        );
      const message = JSON.stringify({ topic, text });
      for (const { connection } of publishers.values())
        connection.sendData(message);
      return Promise.resolve();
    },
    data$: data$.pipe(share()),
  };
}

/** A message of the `sendData` data stream, or null for a malformed one. */
function parseDataMessage(
  message: string,
): Pick<DataPacket, "topic" | "text"> | null {
  try {
    const { topic, text } = JSON.parse(message) as Record<string, unknown>;
    return typeof topic === "string" && typeof text === "string"
      ? { topic, text }
      : null;
  } catch {
    return null;
  }
}

/** One peer connection as the developer tools show it. */
function describe(
  { userId, deviceId, memberId }: Peer,
  { connectionId, pc }: PeerConnectionBase,
): Record<string, string> {
  return {
    userId,
    deviceId,
    memberId,
    connectionId,
    connectionState: pc.connectionState,
    iceConnectionState: pc.iceConnectionState,
    signalingState: pc.signalingState,
  };
}

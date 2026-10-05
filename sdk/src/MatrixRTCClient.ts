/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixClient, type Room } from "matrix-js-sdk";
import { type Logger, logger as rootLogger } from "matrix-js-sdk/lib/logger";
import {
  type MatrixRTCSession as JsSdkRTCSession,
  MatrixRTCSessionEvent,
  MatrixRTCSessionManager,
  MembershipManagerEvent,
} from "matrix-js-sdk/lib/matrixrtc";
import { type IMembershipManager } from "matrix-js-sdk/lib/matrixrtc/IMembershipManager";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";
import { v4 as uuidv4 } from "uuid";
import { combineLatest, filter, from, fromEvent, map, Observable } from "rxjs";

import { defaultSessionTimings, MatrixRTCMode } from "./config";
import { E2eeType } from "./encryption";
import { type ObservableScope } from "./reactive/ObservableScope";
import { filterBehavior, generateItems } from "./reactive/observable";
import { mapScoped } from "./utils/mapScoped";
import {
  type DataMessage,
  type LocalRTCMember,
  type MatrixRTCClient,
  type MatrixRTCClientOptions,
  type RemoteRTCMember,
} from "./api";
import {
  type MediaBackend,
  type MediaBackendContext,
  type MediaKey,
} from "./media-backend/api";
import { createLivekitBackend } from "./media-backend/livekit/LivekitBackend";
import { MatrixRTCError } from "./errors";
import { createHomeserverConnected$ } from "./matrixrtc/HomeserverConnected";
import { joinJsSdkSession } from "./matrixrtc/joinJsSdkSession";
import {
  createLocalMembership$,
  type PreparedTransport,
} from "./matrixrtc/LocalMember";
import { discoverLocalTransport } from "./matrixrtc/LocalTransport";
import {
  createMatrixMemberMetadata$,
  createRoomMembers$,
} from "./matrixrtc/MatrixMemberMetadata";
import {
  createLocalRTCMember,
  createRemoteRTCMember,
  membershipKeys,
} from "./matrixrtc/Members";
import {
  createKeyRotationSuppressed$,
  createMemberships$,
} from "./matrixrtc/JsRtcSessionBehaviors";
import { fatalError, sessionStatus } from "./matrixrtc/status";
import { createTransportRegistry } from "./matrixrtc/Transports";

/**
 * Takes the whole `MatrixClient` rather than a slice of it, and finds the
 * MatrixRTC session itself. The js-sdk is the MatrixRTC implementation today;
 * when the rust-rtc crate replaces it, the SDK has to bridge the crate to the
 * js-sdk client, and only the SDK knows what that bridge needs. Holding the
 * client keeps that change inside the SDK.
 */
export function createMatrixRTCClient(
  scope: ObservableScope,
  client: MatrixClient,
  room: Room,
  options: MatrixRTCClientOptions,
): MatrixRTCClient {
  const logger = rootLogger.getChild("[MatrixRTCClient]");
  const userId = client.getUserId();
  const deviceId = client.getDeviceId();
  if (!(userId && deviceId))
    throw new MatrixRTCError("The client has to be logged in");
  const { encryptionSystem, matrixRTCMode } = options;
  const timings = { ...defaultSessionTimings, ...options.timings };

  const jsSdkSession = sessionManager(
    scope,
    client,
    options,
    logger,
  ).getRoomSession(room);

  const ownMembershipIdentity: CallMembershipIdentityParts = {
    userId,
    deviceId,
    // A pre-sticky membership names itself `${userId}:${deviceId}`, and the
    // key transport stamps this id into every key event, so a uuid there
    // would name a member no peer can resolve
    memberId:
      matrixRTCMode === MatrixRTCMode.Matrix_2_0
        ? uuidv4()
        : `${userId}:${deviceId}`,
  };

  const backend = createBackend(scope, client, options, {
    roomId: room.roomId,
    ownMembershipIdentity,
    publish: options.publish,
    encryptionSystem,
    mediaKeys$: mediaKeys$(jsSdkSession),
    timings,
    logger,
  });

  const memberships$ = createMemberships$(scope, jsSdkSession);
  const transports = createTransportRegistry(scope, backend.connections$);

  const preparedTransport$ = from(
    discoverLocalTransport(client, backend.transportType, options, logger).then(
      async (transport): Promise<PreparedTransport> => ({
        transport,
        ...(await backend.prepareLocalTransport(transport)),
      }),
    ),
  );

  const localMembership = createLocalMembership$({
    scope,
    local: backend.local,
    delegateDelayedLeave: async (delayId) =>
      backend.delegateDelayedLeave(delayId),
    preparedTransport$,
    homeserverConnected: createHomeserverConnected$(
      scope,
      client,
      jsSdkSession,
      timings.syncDisconnectGracePeriodMs,
    ),
    joinMatrixRTC: (transport, delayedLeave) =>
      joinJsSdkSession(jsSdkSession, ownMembershipIdentity, transport, {
        encryptMedia: encryptionSystem.kind !== E2eeType.NONE,
        matrixRTCMode,
        sendNotificationType: options.sendNotificationType,
        applicationData: options.applicationData,
        timings,
        delayedLeave,
      }),
    membershipManagerError$: fromEvent(
      jsSdkSession,
      MatrixRTCSessionEvent.MembershipManagerError,
    ),
    matrixRTCSession: jsSdkSession,
    delayId$: scope.behavior(
      (
        fromEvent(
          jsSdkSession,
          MembershipManagerEvent.DelayIdChanged,
          // The re-emitted event carries the original emitter as the second argument
        ) as Observable<[string | undefined, IMembershipManager]>
      ).pipe(map(([delayId]) => delayId ?? null)),
      jsSdkSession.delayId ?? null,
    ),
    timings,
    logger,
  });

  const context = {
    metadata: createMatrixMemberMetadata$(
      scope,
      scope.behavior(memberships$.pipe(map(({ value }) => value))),
      createRoomMembers$(scope, room),
    ),
    transports,
  };

  const remoteMembers$ = scope.behavior<RemoteRTCMember[]>(
    memberships$.pipe(
      map(({ value }) => value),
      generateItems(
        "MatrixRTCClient remoteMembers",
        function* (memberships) {
          for (const membership of memberships) {
            if (
              membership.userId === userId &&
              membership.deviceId === deviceId
            )
              continue;
            yield { keys: membershipKeys(membership), data: membership };
          }
        },
        (memberScope, membership$) =>
          createRemoteRTCMember(
            memberScope,
            membership$,
            backend.mediaFor$(memberScope, membership$),
            context,
          ),
      ),
    ),
  );

  const localMembership$ = scope.behavior(
    memberships$.pipe(
      map(
        ({ value }) =>
          value.find(
            (membership) =>
              membership.userId === userId && membership.deviceId === deviceId,
          ) ?? null,
      ),
      filterBehavior((membership) => membership !== null),
    ),
  );
  const localMember$ = scope.behavior<LocalRTCMember | null>(
    mapScoped(scope, localMembership$, (memberScope, membership$) =>
      createLocalRTCMember(memberScope, membership$, backend.local, context),
    ).pipe(map((member) => member ?? null)),
  );

  // A packet from an identity that is not a member is dropped, so a host only
  // ever hears from attested members
  const data$ = backend.data$.pipe(
    map(({ senderId, topic, text }): DataMessage | null => {
      const member = remoteMembers$.value.find((m) => m.id === senderId);
      if (member === undefined) {
        logger.warn(`Dropping data from ${senderId}: not a member`);
        return null;
      }
      return { member, topic, text };
    }),
    filter((message) => message !== null),
  );

  const status$ = scope.behavior(
    combineLatest(
      [
        localMembership.state$,
        localMembership.joinRequested$,
        localMembership.connected$,
        localMembership.reconnecting$,
      ],
      sessionStatus,
    ),
  );

  return {
    join: localMembership.requestJoinAndPublish,
    leave: localMembership.requestDisconnect,
    status$,
    connected$: localMembership.connected$,
    reconnecting$: localMembership.reconnecting$,
    disconnectReason$: localMembership.disconnectReason$,
    fatalError$: scope.behavior(localMembership.state$.pipe(map(fatalError))),
    localMember$,
    remoteMembers$,
    memberCount$: scope.behavior(
      combineLatest(
        [localMember$, remoteMembers$],
        (local, remote) => remote.length + (local === null ? 0 : 1),
      ),
    ),
    keyRotationSuppressed$: createKeyRotationSuppressed$(scope, jsSdkSession),
    connectedTransports$: transports.connected$,
    setAudioOutputDeviceId: async (deviceId) =>
      backend.setAudioOutputDeviceId(deviceId),
    sendData: async (topic, text) => backend.sendData(topic, text),
    data$,
  };
}

/** The host's backend, or LiveKit configured from the client options. */
function createBackend(
  scope: ObservableScope,
  client: MatrixClient,
  { backend, mediaQuality, matrixRTCMode }: MatrixRTCClientOptions,
  context: MediaBackendContext,
): MediaBackend {
  if (backend) return backend(scope, context);
  return createLivekitBackend(scope, context, {
    client,
    mediaQuality,
    tokenEndpoint:
      matrixRTCMode === MatrixRTCMode.Matrix_2_0 ? "msc4195" : "legacy",
  });
}

/** The session's per-participant keys: the ones it already holds on subscribe, then each new one. */
function mediaKeys$(session: JsSdkRTCSession): Observable<MediaKey> {
  return new Observable((subscriber) => {
    const onKey = (
      key: Uint8Array<ArrayBuffer>,
      index: number,
      _membership: CallMembershipIdentityParts,
      participantId: string,
    ): void => subscriber.next({ participantId, index, key });
    session.on(MatrixRTCSessionEvent.EncryptionKeyChanged, onKey);
    session.reemitEncryptionKeys();
    return () => session.off(MatrixRTCSessionEvent.EncryptionKeyChanged, onKey);
  });
}

/**
 * The js-sdk keeps one session manager per slot. The client comes with the
 * manager for the default slot; any other slot gets a manager of its own,
 * which lives as long as the scope.
 */
function sessionManager(
  scope: ObservableScope,
  client: MatrixClient,
  { application = "m.call", slot = "ROOM" }: MatrixRTCClientOptions,
  logger: Logger,
): MatrixRTCSessionManager {
  if (application === "m.call" && slot === "ROOM") return client.matrixRTC;
  const manager = new MatrixRTCSessionManager(logger, client, {
    application,
    id: slot,
  });
  manager.start();
  scope.onEnd(() => manager.stop());
  return manager;
}

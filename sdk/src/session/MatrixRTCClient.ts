/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixClient, type Room } from "matrix-js-sdk";
import { type Logger, logger as rootLogger } from "matrix-js-sdk/lib/logger";
import {
  MatrixRTCSessionEvent,
  MatrixRTCSessionManager,
  MembershipManagerEvent,
} from "matrix-js-sdk/lib/matrixrtc";
import { type IMembershipManager } from "matrix-js-sdk/lib/matrixrtc/IMembershipManager";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";
import { v4 as uuidv4 } from "uuid";
import { combineLatest, from, fromEvent, map, type Observable } from "rxjs";

import { defaultSessionTimings, MatrixRTCMode } from "../config";
import { type ObservableScope } from "../reactive/ObservableScope";
import { filterBehavior, generateItems } from "../reactive/observable";
import { mapScoped } from "../utils/mapScoped";
import {
  type LocalMediaInputs,
  type LocalRTCMember,
  type MatrixRTCClient,
  type MatrixRTCClientOptions,
  type RemoteRTCMember,
} from "../api";
import { MatrixRTCError } from "../errors";
import { LivekitConnectionFactory } from "./ConnectionFactory";
import { createHomeserverConnected$ } from "./HomeserverConnected";
import { joinJsSdkSession } from "./joinJsSdkSession";
import { createKeyProvider } from "./KeyProvider";
import { createLocalMembership$ } from "./LocalMember";
import { getLocalTransport } from "./LocalTransport";
import { createRemoteMatrixLivekitMembers$ } from "./MatrixLivekitMembers";
import {
  createMatrixMemberMetadata$,
  createRoomMembers$,
} from "./MatrixMemberMetadata";
import {
  createLocalRTCMember,
  createRemoteRTCMember,
  membershipKeys,
} from "./Members";
import { createConnectionManager$ } from "./ConnectionManager";
import { createDataChannel$ } from "./DataChannel";
import { type DesiredMedia, Publisher } from "./Publisher";
import {
  createKeyRotationSuppressed$,
  createMemberships$,
  membershipsAndTransports$,
} from "./SessionBehaviors";
import { fatalError, sessionStatus } from "./status";
import { createTransportRegistry } from "./Transports";

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
  localMedia: LocalMediaInputs,
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
  const keyProvider = createKeyProvider(encryptionSystem, jsSdkSession, logger);

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

  const memberships$ = createMemberships$(scope, jsSdkSession);
  const { membershipsWithTransport$, transports$ } = membershipsAndTransports$(
    scope,
    memberships$,
  );

  const localTransport$ = from(
    getLocalTransport({
      client,
      ownMembershipIdentity,
      roomId: room.roomId,
      matrixRTCMode,
      transportUrl: options.transportUrl,
      fallbackTransportUrl: options.fallbackTransportUrl,
      logger,
    }),
  );

  const desired: DesiredMedia = new Map(
    localMedia.publish.map((request) => [
      request.source,
      { request, enabled: true },
    ]),
  );

  const connectionManager = createConnectionManager$({
    scope,
    connectionFactory: new LivekitConnectionFactory(
      client,
      room.roomId,
      localMedia,
      keyProvider,
      options.mediaQuality,
    ),
    localTransport$,
    remoteTransports$: transports$,
    logger,
    ownMembershipIdentity,
  });
  const transports = createTransportRegistry(scope, connectionManager);

  const localMembership = createLocalMembership$({
    scope,
    connectionManager,
    localTransport$,
    homeserverConnected: createHomeserverConnected$(
      scope,
      client,
      jsSdkSession,
      timings.syncDisconnectGracePeriodMs,
    ),
    createPublisher: (connection) =>
      new Publisher(
        connection.livekitRoom,
        localMedia,
        desired,
        logger.getChild(
          `[Publisher ${connection.transport.livekit_service_url}]`,
        ),
      ),
    joinMatrixRTC: (transport, delayedLeave) =>
      joinJsSdkSession(jsSdkSession, ownMembershipIdentity, transport, {
        encryptMedia: keyProvider !== undefined,
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
    client,
    roomId: room.roomId,
    ownMembershipIdentity,
    matrixRTCMode,
    timings,
    desired,
    logger,
  });

  const context = {
    metadata: createMatrixMemberMetadata$(
      scope,
      scope.behavior(memberships$.pipe(map(({ value }) => value))),
      createRoomMembers$(scope, room),
    ),
    transports,
    encryptionSystem,
  };

  const remoteMembers$ = scope.behavior<RemoteRTCMember[]>(
    createRemoteMatrixLivekitMembers$({
      scope,
      membershipsWithTransport$,
      connectionManager,
      localUser: { userId, deviceId },
    }).pipe(
      map(({ value }) => value),
      generateItems(
        "MatrixRTCClient remoteMembers",
        function* (members) {
          for (const member of members)
            yield {
              keys: membershipKeys(member.membership$.value),
              data: member,
            };
        },
        (memberScope, member$) =>
          createRemoteRTCMember(memberScope, member$.value, context),
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
      createLocalRTCMember(memberScope, membership$, localMembership, context),
    ).pipe(map((member) => member ?? null)),
  );

  const { data$, sendData } = createDataChannel$({
    scope,
    connectionManager,
    remoteMembers$,
    connection$: localMembership.connection$,
    logger,
  });

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
    sendData,
    data$,
  };
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

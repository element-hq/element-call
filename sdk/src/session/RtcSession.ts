/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixClient, type Room } from "matrix-js-sdk";
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";
import { MatrixRTCSessionEvent } from "matrix-js-sdk/lib/matrixrtc";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";
import { v4 as uuidv4 } from "uuid";
import { combineLatest, from, fromEvent, map } from "rxjs";

import { MatrixRTCMode } from "../../../src/config/ConfigOptions";
import { type ObservableScope } from "../../../src/state/ObservableScope";
import {
  createKeyRotationSuppressed$,
  createMemberships$,
  membershipsAndTransports$,
} from "../../../src/state/SessionBehaviors";
import { createHomeserverConnected$ } from "../../../src/state/CallViewModel/localMember/HomeserverConnected";
import { createConnectionManager$ } from "../../../src/state/CallViewModel/remoteMembers/ConnectionManager";
import { createRemoteMatrixLivekitMembers$ } from "../../../src/state/CallViewModel/remoteMembers/MatrixLivekitMembers";
import {
  createMatrixMemberMetadata$,
  createRoomMembers$,
} from "../../../src/state/CallViewModel/remoteMembers/MatrixMemberMetadata";
import { filterBehavior, generateItems } from "../../../src/utils/observable";
import {
  type LocalMediaInputs,
  type LocalRtcMember,
  type RemoteRtcMember,
  type RtcSession,
  RtcSessionError,
  type RtcSessionOptions,
} from "../api";
import { LivekitConnectionFactory } from "./ConnectionFactory";
import { joinRtcSession, sessionTimings } from "./joinRtcSession";
import { createKeyProvider } from "./KeyProvider";
import { createLocalMembership$ } from "./LocalMember";
import { getLocalTransport } from "./LocalTransport";
import {
  createLocalRtcMember,
  createRemoteRtcMember,
  membershipKeys,
} from "./Members";
import { Publisher } from "./Publisher";
import { mapScoped } from "../utils/mapScoped";
import { fatalError, sessionStatus } from "./status";
import { createTransportRegistry } from "./Transports";

/**
 * Takes the whole `MatrixClient` rather than a slice of it, and finds the
 * MatrixRTC session itself. The js-sdk is the MatrixRTC implementation today;
 * when the rust-rtc crate replaces it, the SDK has to bridge the crate to the
 * js-sdk client, and only the SDK knows what that bridge needs. Holding the
 * client keeps that change inside the SDK.
 */
export function createRtcSession(
  scope: ObservableScope,
  client: MatrixClient,
  room: Room,
  localMedia: LocalMediaInputs,
  options: RtcSessionOptions,
): RtcSession {
  const logger = rootLogger.getChild("[RtcSession]");
  const userId = client.getUserId();
  const deviceId = client.getDeviceId();
  if (!(userId && deviceId))
    throw new RtcSessionError("The client has to be logged in");
  const { encryptionSystem, matrixRTCMode } = options;

  const jsSdkSession = client.matrixRTC.getRoomSession(room);
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
      logger,
    }),
  );

  const connectionManager = createConnectionManager$({
    scope,
    connectionFactory: new LivekitConnectionFactory(
      client,
      room.roomId,
      localMedia,
      keyProvider,
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
      sessionTimings.syncDisconnectGracePeriodMs,
    ),
    createPublisher: (connection) =>
      new Publisher(
        connection.livekitRoom,
        localMedia,
        logger.getChild(
          `[Publisher ${connection.transport.livekit_service_url}]`,
        ),
      ),
    joinMatrixRTC: (transport) =>
      joinRtcSession(jsSdkSession, ownMembershipIdentity, transport, {
        encryptMedia: keyProvider !== undefined,
        matrixRTCMode,
        sendNotificationType: options.sendNotificationType,
        callIntent: options.callIntent,
      }),
    membershipManagerError$: fromEvent(
      jsSdkSession,
      MatrixRTCSessionEvent.MembershipManagerError,
    ),
    matrixRTCSession: jsSdkSession,
    cameraEnabled$: localMedia.cameraEnabled$,
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

  const remoteMembers$ = scope.behavior<RemoteRtcMember[]>(
    createRemoteMatrixLivekitMembers$({
      scope,
      membershipsWithTransport$,
      connectionManager,
      localUser: { userId, deviceId },
    }).pipe(
      map(({ value }) => value),
      generateItems(
        "RtcSession remoteMembers",
        function* (members) {
          for (const member of members)
            yield {
              keys: membershipKeys(member.membership$.value),
              data: member,
            };
        },
        (memberScope, member$) =>
          createRemoteRtcMember(memberScope, member$.value, context),
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
  const localMember$ = scope.behavior<LocalRtcMember | null>(
    mapScoped(scope, localMembership$, (memberScope, membership$) =>
      createLocalRtcMember(memberScope, membership$, localMembership, context),
    ).pipe(map((member) => member ?? null)),
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
  };
}

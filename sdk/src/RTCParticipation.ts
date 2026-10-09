/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixClient, type Room } from "matrix-js-sdk";
import { type Logger } from "matrix-js-sdk/lib/logger";
import {
  type MatrixRTCSession as JsSdkRTCSession,
  MatrixRTCSessionEvent,
  MembershipManagerEvent,
} from "matrix-js-sdk/lib/matrixrtc";
import { type IMembershipManager } from "matrix-js-sdk/lib/matrixrtc/IMembershipManager";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";
import { deepCompare } from "matrix-js-sdk/lib/utils";
import { v4 as uuidv4 } from "uuid";
import {
  combineLatest,
  distinctUntilChanged,
  filter,
  from,
  fromEvent,
  map,
  Observable,
  scan,
} from "rxjs";

import { defaultSessionTimings, MatrixRTCMode } from "./config";
import { E2eeType } from "./encryption";
import { type Behavior } from "./reactive/Behavior";
import { type ObservableScope } from "./reactive/ObservableScope";
import { generateItems } from "./reactive/observable";
import { mapScoped } from "./utils/mapScoped";
import {
  type DataMessage,
  type LocalRTCMember,
  type ParticipationState,
  type RemoteRTCMember,
  type RTCMember,
  type RTCParticipation,
  type RTCParticipationOptions,
  type RTCSlot,
  type RTCSlotOptions,
} from "./api";
import {
  type MediaBackend,
  type MediaBackendContext,
  type MediaKey,
} from "./media-backend/api";
import { createLivekitBackend } from "./media-backend/livekit/LivekitBackend";
import { createHomeserverConnected$ } from "./matrixrtc/HomeserverConnected";
import { joinJsSdkSession } from "./matrixrtc/joinJsSdkSession";
import {
  createLocalMembership$,
  type PreparedTransport,
} from "./matrixrtc/LocalMembership";
import { discoverLocalTransport } from "./matrixrtc/LocalTransport";
import {
  createLocalRTCMember,
  createRemoteRTCMember,
} from "./matrixrtc/Members";
import { createKeyRotationSuppressed$ } from "./matrixrtc/JsRtcSessionBehaviors";
import { type TransportRegistry } from "./matrixrtc/Transports";
import { participationState } from "./participationState";

/** What the slot lends a participation. */
export interface ParticipationDeps {
  client: MatrixClient;
  room: Room;
  slot: RTCSlot;
  jsSdkSession: JsSdkRTCSession;
  members$: Behavior<RTCMember[]>;
  transports: TransportRegistry;
  slotOptions: Pick<RTCSlotOptions, "matrixRTCMode" | "encryptionSystem">;
  logger: Logger;
}

/** The participation, plus what the slot reads from it without exposing it. */
export interface ParticipationInternals {
  participation: RTCParticipation;
  connections$: MediaBackend["connections$"];
}

/**
 * Our span in a slot: the backend, the local transport, the join state
 * machine and the members with the media it carries for them. Starts joining
 * at once and ends with `leave()`, which also ends `scope`.
 */
export function createRTCParticipation(
  scope: ObservableScope,
  {
    client,
    room,
    slot,
    jsSdkSession,
    members$,
    transports,
    slotOptions: { matrixRTCMode, encryptionSystem },
    logger: parentLogger,
  }: ParticipationDeps,
  options: RTCParticipationOptions,
): ParticipationInternals {
  const logger = parentLogger.getChild("[RTCParticipation]");
  const userId = client.getUserId()!;
  const deviceId = client.getDeviceId()!;
  const timings = { ...defaultSessionTimings, ...options.timings };

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

  const backend = createBackend(scope, client, options, matrixRTCMode, {
    roomId: room.roomId,
    ownMembershipIdentity,
    publish: options.publish,
    encryptionSystem,
    mediaKeys$: mediaKeys$(jsSdkSession),
    timings,
    logger,
  });

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

  const remoteMembers$ = scope.behavior<RemoteRTCMember[]>(
    members$.pipe(
      generateItems(
        "RTCParticipation remoteMembers",
        function* (members) {
          for (const member of members)
            if (!member.local) yield { keys: [member] as const, data: member };
        },
        (memberScope, member$) =>
          createRemoteRTCMember(
            member$.value,
            backend.mediaFor(memberScope, member$.value),
          ),
      ),
    ),
  );

  // Matched by the identity we joined with: a stale membership of ours from
  // an earlier participation is `local` in the slot but is not this one
  const ownMember$ = scope.behavior(
    members$.pipe(
      map(
        (members) =>
          members.find(
            (member) =>
              member.local &&
              member.memberId === ownMembershipIdentity.memberId,
          ) ?? null,
      ),
    ),
  );
  const localMember$ = scope.behavior<LocalRTCMember | null>(
    mapScoped(scope, ownMember$, (_memberScope, member) =>
      createLocalRTCMember(member, backend.local),
    ).pipe(map((member) => member ?? null)),
  );

  // A packet from an identity that is not a member is dropped, so a host only
  // ever hears from attested members
  const data$ = backend.data$.pipe(
    map(({ senderId, topic, text }): DataMessage | null => {
      const member = remoteMembers$.value.find(
        (m) => m.rtcBackendIdentity === senderId,
      );
      if (member === undefined) {
        logger.warn(`Dropping data from ${senderId}: not a member`);
        return null;
      }
      return { member, topic, text };
    }),
    filter((message) => message !== null),
  );

  // Nothing leaves this device while it may already have been dropped from
  // the session: the member would show as away while still being heard
  localMembership.state$
    .pipe(
      map((membership) => membership.kind === "joined"),
      distinctUntilChanged(),
      scope.bind(),
    )
    .subscribe((publish) => backend.local.setPublishing(publish));

  const state$ = scope.behavior<ParticipationState>(
    combineLatest([
      localMembership.state$,
      backend.local.connectionState$,
    ]).pipe(
      scan(
        (previous, [membership, media]) =>
          participationState(previous, membership, media),
        { kind: "waitingForTransport" } as ParticipationState,
      ),
      distinctUntilChanged(deepCompare),
    ),
  );

  const leave = (): void => {
    if (state$.value.kind === "left") return;
    localMembership.leave();
    scope.end();
  };

  return {
    connections$: backend.connections$,
    participation: {
      slot,
      leave,
      state$,
      localMember$,
      remoteMembers$,
      publish: async (request) => backend.local.publish(request),
      unpublish: async (source) => backend.local.unpublish(source),
      keyRotationSuppressed$: createKeyRotationSuppressed$(scope, jsSdkSession),
      connectedTransports$: transports.connected$,
      setAudioOutputDeviceId: async (deviceId) =>
        backend.setAudioOutputDeviceId(deviceId),
      sendData: async (topic, text) => backend.sendData(topic, text),
      data$,
    },
  };
}

/** The host's backend, or LiveKit configured from the participation options. */
function createBackend(
  scope: ObservableScope,
  client: MatrixClient,
  { backend, mediaQuality }: RTCParticipationOptions,
  matrixRTCMode: MatrixRTCMode,
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

/** The slot's per-participant keys: the ones it already holds on subscribe, then each new one. */
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

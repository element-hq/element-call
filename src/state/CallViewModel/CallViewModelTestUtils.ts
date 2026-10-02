/*
Copyright 2025 Element Corp.
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type Behavior,
  constant,
  E2eeType,
  type LocalMemberMedia,
  type LocalRTCMember,
  type MatrixRTCMode,
  type ObservableScope,
  type RemoteRTCMember,
} from "@element-hq/matrixrtc-sdk";
import { SyncState } from "matrix-js-sdk/lib/sync";
import { BehaviorSubject, combineLatest, map, of, switchMap } from "rxjs";
import { ClientEvent, type RoomMember, type MatrixClient } from "matrix-js-sdk";
import EventEmitter from "events";

import type { CallMembership } from "matrix-js-sdk/lib/matrixrtc";
import { type RaisedHandInfo, type ReactionInfo } from "../../reactions";
import {
  type CallViewModel,
  createCallViewModel$,
  type CallViewModelOptions,
} from "./CallViewModel";
import { createSentCallNotification$ } from "./CallNotificationLifecycle";
import {
  mockConfig,
  mockMatrixRoom,
  mockMatrixRoomMember,
  mockMatrixRTCClient,
  mockMediaDevices,
  mockVideoTrack,
  mockMemberMedia,
  mockMuteStates,
  MockRTCSession,
  mockRTCMember,
  testScope,
} from "../../utils/test";
import {
  alice,
  aliceDoppelganger,
  bob,
  bobZeroWidthSpace,
  daveRTL,
  daveRTLRtcMember,
  local,
  localRtcMember,
} from "../../utils/test-fixtures";
import { type MediaDevices } from "../MediaDevices";

mockConfig({
  livekit: { livekit_service_url: "http://my-default-service-url.com" },
});

const carol = local;

const dave = mockMatrixRoomMember(daveRTLRtcMember, { rawDisplayName: "Dave" });

/** Whoever publishes media: a stand-in for a LiveKit participant, by identity. */
export interface Participant {
  identity: string;
}

export interface CallViewModelInputs {
  /** The members whose media has arrived. The local member's always has. */
  remoteParticipants$: Behavior<Participant[]>;
  rtcMembers$: Behavior<Partial<CallMembership>[]>;
  roomMembers: RoomMember[];
  /** Whether the local transport is connected. */
  connected$: Behavior<boolean>;
  speaking: Map<Participant, Behavior<boolean>>;
  videoEnabled: Map<Participant, Behavior<boolean>>;
  sharingScreen: Map<Participant, Behavior<boolean>>;
  mediaDevices: MediaDevices;
  initialSyncState: SyncState;
  windowSize$: Behavior<{ width: number; height: number }>;
}

export const localParticipant: Participant = { identity: "" };

export function withCallViewModel(mode: MatrixRTCMode) {
  return (
    {
      remoteParticipants$ = constant([]),
      rtcMembers$ = constant([localRtcMember]),
      roomMembers = [
        alice,
        aliceDoppelganger,
        bob,
        bobZeroWidthSpace,
        carol,
        dave,
        daveRTL,
      ],
      connected$ = constant(true),
      speaking = new Map(),
      videoEnabled = new Map(),
      sharingScreen = new Map(),
      mediaDevices = mockMediaDevices({}),
      initialSyncState = SyncState.Syncing,
      windowSize$ = constant({ width: 1000, height: 800 }),
    }: Partial<CallViewModelInputs> = {},
    continuation: (
      vm: CallViewModel,
      rtcSession: MockRTCSession,
      subjects: {
        raisedHands$: BehaviorSubject<Record<string, RaisedHandInfo>>;
      },
      setSyncState: (value: SyncState) => void,
    ) => void,
    options: Partial<CallViewModelOptions> = {},
  ): void => {
    let syncState = initialSyncState;
    const setSyncState = (value: SyncState): void => {
      const prev = syncState;
      syncState = value;
      room.client.emit(ClientEvent.Sync, value, prev);
    };
    const room = mockMatrixRoom({
      client: new (class extends EventEmitter {
        public getUserId(): string | undefined {
          return localRtcMember.userId;
        }

        public getDeviceId(): string {
          return localRtcMember.deviceId;
        }

        public getDomain(): string {
          return "example.com";
        }

        public getSyncState(): SyncState {
          return syncState;
        }
      })() as Partial<MatrixClient> as MatrixClient,
      getMembers: () => roomMembers,
      getMembersWithMembership: () => roomMembers,
    });
    const rtcSession = new MockRTCSession(room, []).withMemberships(
      rtcMembers$,
    );
    const scope = testScope();

    const mediaOf = (
      scope: ObservableScope,
      participant: Participant,
      local: boolean,
    ): LocalMemberMedia =>
      mockMemberMedia({
        local,
        speaking$: speaking.get(participant) ?? constant(false),
        screenShareEnabled$: sharingScreen.get(participant) ?? constant(false),
        camera$: scope.behavior(
          (videoEnabled.get(participant) ?? constant(false)).pipe(
            map((enabled) =>
              mockVideoTrack({ source: "camera", muted$: constant(!enabled) }),
            ),
          ),
        ),
        screenShare$: scope.behavior(
          (sharingScreen.get(participant) ?? constant(false)).pipe(
            map((sharing) =>
              sharing ? mockVideoTrack({ source: "screenShare" }) : undefined,
            ),
          ),
        ),
      });
    const participantOf = (
      scope: ObservableScope,
      membership: CallMembership,
    ): Behavior<Participant | undefined> =>
      scope.behavior(
        remoteParticipants$.pipe(
          map((participants) =>
            participants.find(
              (p) => p.identity === membership.rtcBackendIdentity,
            ),
          ),
        ),
      );
    const memberOf = (
      scope: ObservableScope,
      membership: CallMembership,
    ): RemoteRTCMember =>
      mockRTCMember(false, {
        membership,
        roomMember: roomMembers.find((m) => m.userId === membership.userId),
        transportUrl: "http://my-default-service-url.com",
        media$: scope.behavior(
          participantOf(scope, membership).pipe(
            map((participant) =>
              participant === undefined
                ? null
                : mediaOf(scope, participant, false),
            ),
          ),
        ),
      });
    const remoteMembers$ = scope.behavior<RemoteRTCMember[]>(
      rtcMembers$.pipe(
        map((memberships) =>
          (memberships as CallMembership[])
            .filter(
              (m) =>
                m.userId !== localRtcMember.userId ||
                m.deviceId !== localRtcMember.deviceId,
            )
            .map((membership) => memberOf(scope, membership)),
        ),
      ),
    );
    const localMember$ = scope.behavior<LocalRTCMember | null>(
      rtcMembers$.pipe(
        map((memberships) =>
          (memberships as CallMembership[]).some(
            (m) =>
              m.userId === localRtcMember.userId &&
              m.deviceId === localRtcMember.deviceId,
          )
            ? mockRTCMember(true, {
                membership: localRtcMember,
                roomMember: carol,
                transportUrl: "http://my-default-service-url.com",
                media$: constant(mediaOf(scope, localParticipant, true)),
              })
            : null,
        ),
      ),
    );
    const rtcClient = mockMatrixRTCClient(scope, {
      localMember$,
      remoteMembers$,
      connected$,
      reconnecting$: scope.behavior(
        combineLatest([connected$, of(initialSyncState)]).pipe(
          switchMap(() => connected$),
          map((connected) => !connected),
        ),
      ),
    });
    const muteStates = mockMuteStates();
    const raisedHands$ = new BehaviorSubject<Record<string, RaisedHandInfo>>(
      {},
    );
    const reactions$ = new BehaviorSubject<Record<string, ReactionInfo>>({});

    const vm = createCallViewModel$(
      scope,
      rtcClient,
      room,
      mediaDevices,
      muteStates,
      {
        encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
        autoLeaveWhenOthersLeft: false,
        sentCallNotification$: createSentCallNotification$(
          scope,
          rtcSession.asMockedSession(),
        ),
        windowSize$,
        ...options,
      },
      raisedHands$,
      reactions$,
    );
    void mode;

    continuation(vm, rtcSession, { raisedHands$: raisedHands$ }, setSyncState);
  };
}

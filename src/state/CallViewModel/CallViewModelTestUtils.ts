/*
Copyright 2025 Element Corp.
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  ConnectionState,
  type Participant,
  ParticipantEvent,
  type RemoteParticipant,
  type Room as LivekitRoom,
  type TrackPublication,
} from "livekit-client";
import { SyncState } from "matrix-js-sdk/lib/sync";
import { BehaviorSubject, combineLatest, map, of } from "rxjs";
import { onTestFinished, vi } from "vitest";
import { ClientEvent, type RoomMember, type MatrixClient } from "matrix-js-sdk";
import EventEmitter from "events";
import * as ComponentsCore from "@livekit/components-core";

import type { CallMembership } from "matrix-js-sdk/lib/matrixrtc";
import { E2eeType } from "../../e2ee/e2eeType";
import { type RaisedHandInfo, type ReactionInfo } from "../../reactions";
import {
  type CallViewModel,
  createCallViewModel$,
  type CallViewModelOptions,
} from "./CallViewModel";
import {
  exampleSfuConfig,
  exampleTransport,
  mockConfig,
  MockConnection,
  mockLivekitRoom,
  mockLocalParticipant,
  mockMatrixRoom,
  mockMatrixRoomMember,
  mockMediaDevices,
  mockMuteStates,
  MockRTCSession,
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
import { type Behavior, constant } from "../Behavior";
import { type ProcessorState } from "../../livekit/TrackProcessorContext";
import { type MediaDevices } from "../MediaDevices";
import { type MatrixRTCMode } from "../../config/ConfigOptions";

mockConfig({
  livekit: { livekit_service_url: "http://my-default-service-url.com" },
});

const carol = local;

const dave = mockMatrixRoomMember(daveRTLRtcMember, { rawDisplayName: "Dave" });

export interface CallViewModelInputs {
  remoteParticipants$: Behavior<RemoteParticipant[]>;
  rtcMembers$: Behavior<Partial<CallMembership>[]>;
  roomMembers: RoomMember[];
  livekitConnectionState$: Behavior<ConnectionState>;
  speaking: Map<Participant, Behavior<boolean>>;
  videoEnabled: Map<Participant, Behavior<boolean>>;
  sharingScreen: Map<Participant, Behavior<boolean>>;
  mediaDevices: MediaDevices;
  initialSyncState: SyncState;
  windowSize$: Behavior<{ width: number; height: number }>;
}

export const localParticipant = mockLocalParticipant({ identity: "" });

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
      livekitConnectionState$: connectionState$ = constant(
        ConnectionState.Connected,
      ),
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
        public getAccessToken(): string | null {
          return "a-token";
        }
      })() as Partial<MatrixClient> as MatrixClient,
      getMembers: () => roomMembers,
      getMembersWithMembership: () => roomMembers,
    });
    const rtcSession = new MockRTCSession(room, []).withMemberships(
      rtcMembers$,
    );
    const participantsSpy = vi
      .spyOn(ComponentsCore, "connectedParticipantsObserver")
      .mockReturnValue(remoteParticipants$);
    const mediaSpy = vi
      .spyOn(ComponentsCore, "observeParticipantMedia")
      .mockImplementation((p) => {
        return (videoEnabled.get(p) ?? constant(false)).pipe(
          map((videoEnabled) => ({
            participant: p,
            isMicrophoneEnabled: false,
            isCameraEnabled: videoEnabled,
            isScreenShareEnabled: false,
            cameraTrack: {
              isMuted: !videoEnabled,
            } as unknown as TrackPublication,
          })),
        );
      });
    const eventsSpy = vi
      .spyOn(ComponentsCore, "observeParticipantEvents")
      .mockImplementation((p, ...eventTypes) => {
        return combineLatest([
          (eventTypes.includes(ParticipantEvent.IsSpeakingChanged) &&
            speaking.get(p)) ||
            constant(false),
          (eventTypes.includes(ParticipantEvent.TrackPublished) &&
            sharingScreen.get(p)) ||
            constant(false),
        ]).pipe(
          map(
            ([isSpeaking, isScreenShareEnabled]) =>
              ({ ...p, isSpeaking, isScreenShareEnabled }) as Participant,
          ),
        );
      });

    const roomEventSelectorSpy = vi
      .spyOn(ComponentsCore, "roomEventSelector")
      .mockImplementation((_room, _eventType) => of());
    const muteStates = mockMuteStates();
    const raisedHands$ = new BehaviorSubject<Record<string, RaisedHandInfo>>(
      {},
    );
    const reactions$ = new BehaviorSubject<Record<string, ReactionInfo>>({});

    const livekitRoomFactory = (): LivekitRoom =>
      mockLivekitRoom({
        localParticipant,
        disconnect: async () => Promise.resolve(),
        setE2EEEnabled: async () => Promise.resolve(),
      });

    const vm = createCallViewModel$(
      testScope(),
      rtcSession.asMockedSession(),
      room,
      mediaDevices,
      muteStates,
      {
        encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
        autoLeaveWhenOthersLeft: false,
        livekitRoomFactory,
        connectionState$,
        windowSize$,
        localTransport: {
          active$: constant({
            transport: exampleTransport,
            sfuConfig: exampleSfuConfig,
          }),
          advertised$: constant(exampleTransport),
        },
        connectionFactory: {
          createConnection(
            scope,
            transport,
            ownMembershipIdentity,
            logger,
            sfuConfig,
          ) {
            return new MockConnection(
              {
                scope,
                transport,
                ownMembershipIdentity,
                existingSFUConfig: sfuConfig,
                client: room.client,
                roomId: room.roomId,
                livekitRoomFactory,
              },
              logger,
            );
          },
        },
        matrixRTCMode$: constant(mode),
        ...options,
      },
      raisedHands$,
      reactions$,
      new BehaviorSubject<ProcessorState>({
        processor: undefined,
        supported: undefined,
      }),
    );

    onTestFinished(() => {
      participantsSpy.mockRestore();
      mediaSpy.mockRestore();
      eventsSpy.mockRestore();
      roomEventSelectorSpy.mockRestore();
    });

    continuation(vm, rtcSession, { raisedHands$: raisedHands$ }, setSyncState);
  };
}

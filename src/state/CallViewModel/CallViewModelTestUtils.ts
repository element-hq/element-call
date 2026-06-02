/*
Copyright 2025 Element Corp.
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  ConnectionState,
  type LocalParticipant,
  type Participant,
  ParticipantEvent,
  type RemoteParticipant,
  type Room as LivekitRoom,
} from "livekit-client";
import { SyncState } from "matrix-js-sdk/lib/sync";
import { BehaviorSubject, type Observable, map, of } from "rxjs";
import { onTestFinished, vi } from "vitest";
import { ClientEvent, type MatrixClient } from "matrix-js-sdk";
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
  mockConfig,
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
import { type MatrixRTCMode } from "../../settings/settings";

mockConfig({
  livekit: { livekit_service_url: "http://my-default-service-url.com" },
});

const carol = local;

const dave = mockMatrixRoomMember(daveRTLRtcMember, { rawDisplayName: "Dave" });

const roomMembers = new Map(
  [alice, aliceDoppelganger, bob, bobZeroWidthSpace, carol, dave, daveRTL].map(
    (p) => [p.userId, p],
  ),
);

export interface CallViewModelInputs {
  remoteParticipants$: Behavior<RemoteParticipant[]>;
  rtcMembers$: Behavior<Partial<CallMembership>[]>;
  livekitConnectionState$: Behavior<ConnectionState>;
  speaking: Map<Participant, Observable<boolean>>;
  mediaDevices: MediaDevices;
  initialSyncState: SyncState;
  windowSize$: Behavior<{ width: number; height: number }>;
}

const localParticipant = mockLocalParticipant({ identity: "" });

export function withCallViewModel(mode: MatrixRTCMode) {
  return (
    {
      remoteParticipants$ = constant([]),
      rtcMembers$ = constant([localRtcMember]),
      livekitConnectionState$: connectionState$ = constant(
        ConnectionState.Connected,
      ),
      speaking = new Map(),
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
      getMembers: () => Array.from(roomMembers.values()),
      getMembersWithMembership: () => Array.from(roomMembers.values()),
    });
    const rtcSession = new MockRTCSession(room, []).withMemberships(
      rtcMembers$,
    );
    const participantsSpy = vi
      .spyOn(ComponentsCore, "connectedParticipantsObserver")
      .mockReturnValue(remoteParticipants$);
    const mediaSpy = vi
      .spyOn(ComponentsCore, "observeParticipantMedia")
      .mockImplementation((p) =>
        of({ participant: p } as Partial<
          ComponentsCore.ParticipantMedia<LocalParticipant>
        > as ComponentsCore.ParticipantMedia<LocalParticipant>),
      );
    const eventsSpy = vi
      .spyOn(ComponentsCore, "observeParticipantEvents")
      .mockImplementation((p, ...eventTypes) => {
        if (eventTypes.includes(ParticipantEvent.IsSpeakingChanged)) {
          return (speaking.get(p) ?? of(false)).pipe(
            map((s): Participant => ({ ...p, isSpeaking: s }) as Participant),
          );
        } else {
          return of(p);
        }
      });

    const roomEventSelectorSpy = vi
      .spyOn(ComponentsCore, "roomEventSelector")
      .mockImplementation((_room, _eventType) => of());
    const muteStates = mockMuteStates();
    const raisedHands$ = new BehaviorSubject<Record<string, RaisedHandInfo>>(
      {},
    );
    const reactions$ = new BehaviorSubject<Record<string, ReactionInfo>>({});

    const vm = createCallViewModel$(
      testScope(),
      rtcSession.asMockedSession(),
      room,
      mediaDevices,
      muteStates,
      {
        encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
        autoLeaveWhenOthersLeft: false,
        livekitRoomFactory: (): LivekitRoom =>
          mockLivekitRoom({
            localParticipant,
            disconnect: async () => Promise.resolve(),
            setE2EEEnabled: async () => Promise.resolve(),
          }),
        connectionState$,
        windowSize$,
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

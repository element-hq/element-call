/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type CallMembership } from "matrix-js-sdk/lib/matrixrtc";
import { BehaviorSubject } from "rxjs";
import { vitest } from "vitest";
import { type RelationsContainer } from "matrix-js-sdk/lib/models/relations-container";
import EventEmitter from "events";
import {
  type RoomMember,
  type MatrixClient,
  type Room,
  SyncState,
} from "matrix-js-sdk";
import { ConnectionState, type Room as LivekitRoom } from "livekit-client";

import { E2eeType } from "../e2ee/e2eeType";
import {
  type CallViewModel,
  createCallViewModel$,
  type CallViewModelOptions,
} from "../state/CallViewModel/CallViewModel";
import {
  mockConfig,
  mockLivekitRoom,
  mockLocalParticipant,
  mockMatrixRoom,
  mockMediaDevices,
  mockMuteStates,
  MockRTCSession,
  testScope,
} from "./test";
import { aliceRtcMember, localRtcMember } from "./test-fixtures";
import { type RaisedHandInfo, type ReactionInfo } from "../reactions";
import { constant } from "../state/Behavior";
import { MatrixRTCMode } from "../settings/settings";

mockConfig({ livekit: { livekit_service_url: "https://example.com" } });

export function getBasicRTCSession(
  members: RoomMember[],
  initialRtcMemberships: CallMembership[] = [localRtcMember, aliceRtcMember],
): {
  rtcSession: MockRTCSession;
  matrixRoom: Room;
  rtcMemberships$: BehaviorSubject<CallMembership[]>;
} {
  const matrixRoomId = "!myRoomId:example.com";
  const matrixRoomMembers = new Map(members.map((p) => [p.userId, p]));

  const roomEmitter = new EventEmitter();
  const clientEmitter = new EventEmitter();
  const matrixRoom = mockMatrixRoom({
    relations: {
      getChildEventsForEvent: vitest.fn(),
    } as Partial<RelationsContainer> as RelationsContainer,
    client: {
      getUserId: () => localRtcMember.userId,
      getDeviceId: () => localRtcMember.deviceId,
      getSyncState: () => SyncState.Syncing,
      getDomain: () => null,
      sendEvent: vitest.fn().mockResolvedValue({ event_id: "$fake:event" }),
      redactEvent: vitest.fn().mockResolvedValue({ event_id: "$fake:event" }),
      decryptEventIfNeeded: vitest.fn().mockResolvedValue(undefined),
      on: vitest
        .fn()
        .mockImplementation(
          (eventName: string, fn: (...args: unknown[]) => void) => {
            clientEmitter.on(eventName, fn);
          },
        ),
      emit: (eventName: string, ...args: unknown[]) =>
        clientEmitter.emit(eventName, ...args),
      off: vitest
        .fn()
        .mockImplementation(
          (eventName: string, fn: (...args: unknown[]) => void) => {
            clientEmitter.off(eventName, fn);
          },
        ),
    } as Partial<MatrixClient> as MatrixClient,
    getMember: (userId) => matrixRoomMembers.get(userId) ?? null,
    getMembers: () => Array.from(matrixRoomMembers.values()),
    getMembersWithMembership: () => Array.from(matrixRoomMembers.values()),
    guessDMUserId: vitest.fn(),
    roomId: matrixRoomId,
    on: vitest
      .fn()
      .mockImplementation(
        (eventName: string, fn: (...args: unknown[]) => void) => {
          roomEmitter.on(eventName, fn);
        },
      ),
    emit: (eventName: string, ...args: unknown[]) =>
      roomEmitter.emit(eventName, ...args),
    off: vitest
      .fn()
      .mockImplementation(
        (eventName: string, fn: (...args: unknown[]) => void) => {
          roomEmitter.off(eventName, fn);
        },
      ),
  });

  const rtcMemberships$ = new BehaviorSubject<CallMembership[]>(
    initialRtcMemberships,
  );

  const fakeRtcSession = new MockRTCSession(matrixRoom).withMemberships(
    rtcMemberships$,
  );

  return {
    rtcSession: fakeRtcSession,
    matrixRoom,
    rtcMemberships$,
  };
}

/**
 * Construct a basic CallViewModel to test components that make use of it.
 * @param members
 * @param initialRtcMemberships
 * @returns
 */
export function getBasicCallViewModelEnvironment(
  members: RoomMember[],
  initialRtcMemberships: CallMembership[] = [localRtcMember, aliceRtcMember],
  callViewModelOptions: Partial<CallViewModelOptions> = {},
): {
  vm: CallViewModel;
  rtcMemberships$: BehaviorSubject<CallMembership[]>;
  rtcSession: MockRTCSession;
  handRaisedSubject$: BehaviorSubject<Record<string, RaisedHandInfo>>;
  reactionsSubject$: BehaviorSubject<Record<string, ReactionInfo>>;
} {
  const { rtcSession, matrixRoom, rtcMemberships$ } = getBasicRTCSession(
    members,
    initialRtcMemberships,
  );
  const handRaisedSubject$ = new BehaviorSubject({});
  const reactionsSubject$ = new BehaviorSubject({});

  // const remoteParticipants$ = of([aliceParticipant]);

  const vm = createCallViewModel$(
    testScope(),
    rtcSession.asMockedSession(),
    matrixRoom,
    mockMediaDevices({}),
    mockMuteStates(),
    {
      encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
      livekitRoomFactory: (): LivekitRoom =>
        mockLivekitRoom({
          localParticipant: mockLocalParticipant({ identity: "" }),
          remoteParticipants: new Map(),
          disconnect: async () => Promise.resolve(),
          setE2EEEnabled: async () => Promise.resolve(),
        }),
      connectionState$: constant(ConnectionState.Connected),
      matrixRTCMode$: constant(MatrixRTCMode.Legacy),
      ...callViewModelOptions,
    },
    handRaisedSubject$,
    reactionsSubject$,
    constant({ processor: undefined, supported: false }),
  );
  return {
    vm,
    rtcMemberships$,
    rtcSession,
    handRaisedSubject$: handRaisedSubject$,
    reactionsSubject$: reactionsSubject$,
  };
}

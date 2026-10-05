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

import { E2eeType } from "@element-hq/matrixrtc-sdk";
import {
  type CallViewModel,
  createCallViewModel$,
  type CallViewModelOptions,
} from "../state/CallViewModel/CallViewModel";
import {
  mockConfig,
  mockMatrixRoom,
  mockMatrixRTCClient,
  mockMediaDevices,
  mockMuteStates,
  MockRTCSession,
  mockRTCMember,
  testScope,
} from "./test";
import { type MediaDevices } from "../state/MediaDevices";
import { aliceRtcMember, localRtcMember } from "./test-fixtures";
import { type RaisedHandInfo, type ReactionInfo } from "../reactions";
import { constant } from "@element-hq/matrixrtc-sdk";
import { map } from "rxjs";
import { createCallFooterViewModel } from "../components/CallFooterViewModel";
import { createSentCallNotification$ } from "../state/CallViewModel/CallNotificationLifecycle";
import { HeaderStyle } from "../UrlParams";
import { type FooterSnapshot } from "../components/CallFooter";
import { type ViewModel } from "../state/ViewModel";
import { createDeveloperSettingsTabViewModel } from "../settings/DeveloperSettingsTabViewModel";
import { type DeveloperSettingsSnapshot } from "../settings/DeveloperSettingsTab";

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
      getAccessToken: () => "fake-token",
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
 * @param members - Room members to include in the call.
 * @param initialRtcMemberships - RTC memberships to start with.
 * @returns
 */
export function getBasicCallViewModelEnvironment(
  members: RoomMember[],
  initialRtcMemberships: CallMembership[] = [localRtcMember, aliceRtcMember],
  mediaDevicesOverride?: MediaDevices,
  callViewModelOptions: Partial<CallViewModelOptions> = {},
): {
  vm: CallViewModel;
  footerVm: ViewModel<FooterSnapshot>;
  developerSettingsVm: ViewModel<DeveloperSettingsSnapshot>;
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

  const scope = testScope();
  const muteStates = mockMuteStates();
  const mediaDevices = mediaDevicesOverride ?? mockMediaDevices({});
  // Every membership is a member whose media has arrived
  const rtcClient = mockMatrixRTCClient(scope, {
    localMember$: scope.behavior(
      rtcMemberships$.pipe(
        map((memberships) =>
          memberships.some((m) => m.userId === localRtcMember.userId)
            ? mockRTCMember(true, {
                membership: localRtcMember,
                roomMember: members.find(
                  (m) => m.userId === localRtcMember.userId,
                ),
                transportUrl: "https://example.com",
                tracks$: constant([]),
              })
            : null,
        ),
      ),
    ),
    remoteMembers$: scope.behavior(
      rtcMemberships$.pipe(
        map((memberships) =>
          memberships
            .filter((m) => m.userId !== localRtcMember.userId)
            .map((membership) =>
              mockRTCMember(false, {
                membership,
                roomMember: members.find((m) => m.userId === membership.userId),
                transportUrl: "https://example.com",
                tracks$: constant([]),
              }),
            ),
        ),
      ),
    ),
  });
  const vm = createCallViewModel$(
    scope,
    rtcClient,
    matrixRoom,
    mediaDevices,
    muteStates,
    {
      encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
      sentCallNotification$: createSentCallNotification$(
        scope,
        rtcSession.asMockedSession(),
      ),
      windowSize$: constant({ width: 1000, height: 800 }),
      ...callViewModelOptions,
    },
    handRaisedSubject$,
    reactionsSubject$,
  );
  const footerVm = createCallFooterViewModel(
    testScope(),
    vm,
    muteStates,
    mediaDevices,
    "reactionId",
    { showControls: true, header: HeaderStyle.Standard },
  );
  return {
    vm,
    footerVm,
    developerSettingsVm: createDeveloperSettingsTabViewModel(testScope(), vm),
    rtcMemberships$,
    rtcSession,
    handRaisedSubject$: handRaisedSubject$,
    reactionsSubject$: reactionsSubject$,
  };
}

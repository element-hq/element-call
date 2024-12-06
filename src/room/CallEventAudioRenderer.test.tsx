/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { render } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import { MatrixClient } from "matrix-js-sdk/src/client";
import { ConnectionState, Room } from "livekit-client";
import { BehaviorSubject, of } from "rxjs";
import { afterEach } from "node:test";
import { act } from "react";
import {
  CallMembership,
  type MatrixRTCSession,
} from "matrix-js-sdk/src/matrixrtc";

import { soundEffectVolumeSetting } from "../settings/settings";
import {
  EmittableMockLivekitRoom,
  mockLivekitRoom,
  mockLocalParticipant,
  mockMatrixRoom,
  mockMatrixRoomMember,
  mockMediaPlay,
  mockRemoteParticipant,
  mockRtcMembership,
  MockRTCSession,
} from "../utils/test";
import { E2eeType } from "../e2ee/e2eeType";
import { CallViewModel } from "../state/CallViewModel";
import {
  CallEventAudioRenderer,
  MAX_PARTICIPANT_COUNT_FOR_SOUND,
} from "./CallEventAudioRenderer";

const localRtcMember = mockRtcMembership("@carol:example.org", "CCCC");
const local = mockMatrixRoomMember(localRtcMember);
const aliceRtcMember = mockRtcMembership("@alice:example.org", "AAAA");
const alice = mockMatrixRoomMember(aliceRtcMember);
const bobRtcMember = mockRtcMembership("@bob:example.org", "BBBB");
const bob = mockMatrixRoomMember(bobRtcMember);
const localParticipant = mockLocalParticipant({ identity: "" });
const aliceId = `${alice.userId}:${aliceRtcMember.deviceId}`;
const bobId = `${bob.userId}:${bobRtcMember.deviceId}`;
const aliceParticipant = mockRemoteParticipant({ identity: aliceId });
const bobParticipant = mockRemoteParticipant({ identity: bobId });

const originalPlayFn = window.HTMLMediaElement.prototype.play;

const enterSound = "http://localhost:3000/src/sound/join_call.ogg";
const leaveSound = "http://localhost:3000/src/sound/left_call.ogg";

beforeEach(() => {
  soundEffectVolumeSetting.setValue(soundEffectVolumeSetting.defaultValue);
});

afterEach(() => {
  window.HTMLMediaElement.prototype.play = originalPlayFn;
});

test("plays a sound when entering a call", () => {
  const audioIsPlaying: string[] = mockMediaPlay();
  const matrixRoomMembers = new Map(
    [local, alice, bob].map((p) => [p.userId, p]),
  );
  const remoteParticipants = of([aliceParticipant]);
  const liveKitRoom = mockLivekitRoom(
    { localParticipant },
    { remoteParticipants },
  );
  const matrixRoom = mockMatrixRoom({
    client: {
      getUserId: () => localRtcMember.sender,
      getDeviceId: () => localRtcMember.deviceId,
    } as Partial<MatrixClient> as MatrixClient,
    getMember: (userId) => matrixRoomMembers.get(userId) ?? null,
  });

  const session = new MockRTCSession(matrixRoom, localRtcMember, [
    aliceRtcMember,
  ]) as unknown as MatrixRTCSession;

  const vm = new CallViewModel(
    session,
    liveKitRoom,
    {
      kind: E2eeType.PER_PARTICIPANT,
    },
    of(ConnectionState.Connected),
  );

  render(<CallEventAudioRenderer vm={vm} />);
  expect(audioIsPlaying).toEqual([
    // Joining the call
    enterSound,
  ]);
});

test("plays no sound when muted", () => {
  soundEffectVolumeSetting.setValue(0);
  const audioIsPlaying: string[] = mockMediaPlay();
  const matrixRoomMembers = new Map(
    [local, alice, bob].map((p) => [p.userId, p]),
  );
  const remoteParticipants = of([aliceParticipant, bobParticipant]);
  const liveKitRoom = mockLivekitRoom(
    { localParticipant },
    { remoteParticipants },
  );

  const matrixRoom = mockMatrixRoom({
    client: {
      getUserId: () => localRtcMember.sender,
      getDeviceId: () => localRtcMember.deviceId,
    } as Partial<MatrixClient> as MatrixClient,
    getMember: (userId) => matrixRoomMembers.get(userId) ?? null,
  });

  const session = new MockRTCSession(matrixRoom, localRtcMember, [
    aliceRtcMember,
  ]) as unknown as MatrixRTCSession;

  const vm = new CallViewModel(
    session,
    liveKitRoom,
    {
      kind: E2eeType.PER_PARTICIPANT,
    },
    of(ConnectionState.Connected),
  );

  render(<CallEventAudioRenderer vm={vm} />);
  // Play a sound when joining a call.
  expect(audioIsPlaying).toHaveLength(0);
});

test("plays a sound when a user joins", () => {
  const audioIsPlaying: string[] = mockMediaPlay();
  const matrixRoomMembers = new Map([local, alice].map((p) => [p.userId, p]));
  const remoteParticipants = new Map(
    [aliceParticipant].map((p) => [p.identity, p]),
  );
  const liveKitRoom = new EmittableMockLivekitRoom({
    localParticipant,
    remoteParticipants,
  });

  const matrixRoom = mockMatrixRoom({
    client: {
      getUserId: () => localRtcMember.sender,
      getDeviceId: () => localRtcMember.deviceId,
    } as Partial<MatrixClient> as MatrixClient,
    getMember: (userId) => matrixRoomMembers.get(userId) ?? null,
  });

  const remoteRtcMemberships = new BehaviorSubject<CallMembership[]>([
    aliceRtcMember,
  ]);
  // we give Bob an RTC session now, but no participant yet
  const session = new MockRTCSession(
    matrixRoom,
    localRtcMember,
  ).withMemberships(
    remoteRtcMemberships.asObservable(),
  ) as unknown as MatrixRTCSession;

  const vm = new CallViewModel(
    session,
    liveKitRoom as unknown as Room,
    {
      kind: E2eeType.PER_PARTICIPANT,
    },
    of(ConnectionState.Connected),
  );
  render(<CallEventAudioRenderer vm={vm} />);

  act(() => {
    remoteRtcMemberships.next([aliceRtcMember, bobRtcMember]);
  });
  // Play a sound when joining a call.
  expect(audioIsPlaying).toEqual([
    // Joining the call
    enterSound,
    // Bob joins
    enterSound,
  ]);
});

test("plays a sound when a user leaves", () => {
  const audioIsPlaying: string[] = mockMediaPlay();
  const matrixRoomMembers = new Map([local, alice].map((p) => [p.userId, p]));
  const remoteParticipants = new Map(
    [aliceParticipant].map((p) => [p.identity, p]),
  );
  const liveKitRoom = new EmittableMockLivekitRoom({
    localParticipant,
    remoteParticipants,
  });

  const matrixRoom = mockMatrixRoom({
    client: {
      getUserId: () => localRtcMember.sender,
      getDeviceId: () => localRtcMember.deviceId,
    } as Partial<MatrixClient> as MatrixClient,
    getMember: (userId) => matrixRoomMembers.get(userId) ?? null,
  });

  const remoteRtcMemberships = new BehaviorSubject<CallMembership[]>([
    aliceRtcMember,
  ]);

  const session = new MockRTCSession(
    matrixRoom,
    localRtcMember,
  ).withMemberships(remoteRtcMemberships) as unknown as MatrixRTCSession;

  const vm = new CallViewModel(
    session,
    liveKitRoom as unknown as Room,
    {
      kind: E2eeType.PER_PARTICIPANT,
    },
    of(ConnectionState.Connected),
  );
  render(<CallEventAudioRenderer vm={vm} />);

  act(() => {
    remoteRtcMemberships.next([]);
  });
  expect(audioIsPlaying).toEqual([
    // Joining the call
    enterSound,
    // Alice leaves
    leaveSound,
  ]);
});

test("plays no sound when the session member count is larger than the max, until decreased", () => {
  const audioIsPlaying: string[] = mockMediaPlay();
  const matrixRoomMembers = new Map([local, alice].map((p) => [p.userId, p]));
  const remoteParticipants = new Map(
    [aliceParticipant].map((p) => [p.identity, p]),
  );

  const mockRtcMemberships: CallMembership[] = [];

  for (let i = 0; i < MAX_PARTICIPANT_COUNT_FOR_SOUND; i++) {
    mockRtcMemberships.push(
      mockRtcMembership(`@user${i}:example.org`, `DEVICE${i}`),
    );
  }

  const remoteRtcMemberships = new BehaviorSubject<CallMembership[]>(
    mockRtcMemberships,
  );

  const liveKitRoom = new EmittableMockLivekitRoom({
    localParticipant,
    remoteParticipants,
  });

  const matrixRoom = mockMatrixRoom({
    client: {
      getUserId: () => localRtcMember.sender,
      getDeviceId: () => localRtcMember.deviceId,
    } as Partial<MatrixClient> as MatrixClient,
    getMember: (userId) => matrixRoomMembers.get(userId) ?? null,
  });

  const session = new MockRTCSession(
    matrixRoom,
    localRtcMember,
  ).withMemberships(remoteRtcMemberships) as unknown as MatrixRTCSession;

  const vm = new CallViewModel(
    session,
    liveKitRoom as unknown as Room,
    {
      kind: E2eeType.PER_PARTICIPANT,
    },
    of(ConnectionState.Connected),
  );
  render(<CallEventAudioRenderer vm={vm} />);
  expect(audioIsPlaying).toEqual([]);
  // When the count drops to the max we should play the leave sound
  act(() => {
    remoteRtcMemberships.next(
      mockRtcMemberships.slice(0, MAX_PARTICIPANT_COUNT_FOR_SOUND - 1),
    );
  });
  expect(audioIsPlaying).toEqual([leaveSound]);
});

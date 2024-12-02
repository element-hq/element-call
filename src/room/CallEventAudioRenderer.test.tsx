/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { render } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import { MatrixClient } from "matrix-js-sdk/src/client";
import { ConnectionState, RemoteParticipant, Room } from "livekit-client";
import { of } from "rxjs";
import { afterEach } from "node:test";
import { act } from "react";

import { soundEffectVolumeSetting } from "../settings/settings";
import {
  EmittableMockLivekitRoom,
  mockLivekitRoom,
  mockLocalParticipant,
  mockMatrixRoom,
  mockMatrixRoomMember,
  mockMediaPlay,
  mockRemoteParticipant,
} from "../utils/test";
import { E2eeType } from "../e2ee/e2eeType";
import { CallViewModel } from "../state/CallViewModel";
import {
  CallEventAudioRenderer,
  MAX_PARTICIPANT_COUNT_FOR_SOUND,
} from "./CallEventAudioRenderer";

const alice = mockMatrixRoomMember({ userId: "@alice:example.org" });
const bob = mockMatrixRoomMember({ userId: "@bob:example.org" });
const aliceId = `${alice.userId}:AAAA`;
const bobId = `${bob.userId}:BBBB`;
const localParticipant = mockLocalParticipant({ identity: "" });
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
  const members = new Map([alice, bob].map((p) => [p.userId, p]));
  const remoteParticipants = of([aliceParticipant]);
  const liveKitRoom = mockLivekitRoom(
    { localParticipant },
    { remoteParticipants },
  );

  const vm = new CallViewModel(
    mockMatrixRoom({
      client: {
        getUserId: () => "@carol:example.org",
      } as Partial<MatrixClient> as MatrixClient,
      getMember: (userId) => members.get(userId) ?? null,
    }),
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
  const members = new Map([alice, bob].map((p) => [p.userId, p]));
  const remoteParticipants = of([aliceParticipant, bobParticipant]);
  const liveKitRoom = mockLivekitRoom(
    { localParticipant },
    { remoteParticipants },
  );

  const vm = new CallViewModel(
    mockMatrixRoom({
      client: {
        getUserId: () => "@carol:example.org",
      } as Partial<MatrixClient> as MatrixClient,
      getMember: (userId) => members.get(userId) ?? null,
    }),
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
  const members = new Map([alice].map((p) => [p.userId, p]));
  const remoteParticipants = new Map(
    [aliceParticipant].map((p) => [p.identity, p]),
  );
  const liveKitRoom = new EmittableMockLivekitRoom({
    localParticipant,
    remoteParticipants,
  });

  const vm = new CallViewModel(
    mockMatrixRoom({
      client: {
        getUserId: () => "@carol:example.org",
      } as Partial<MatrixClient> as MatrixClient,
      getMember: (userId) => members.get(userId) ?? null,
    }),
    liveKitRoom as unknown as Room,
    {
      kind: E2eeType.PER_PARTICIPANT,
    },
    of(ConnectionState.Connected),
  );
  render(<CallEventAudioRenderer vm={vm} />);

  act(() => {
    liveKitRoom.addParticipant(bobParticipant);
  });
  // Play a sound when joining a call.
  expect(audioIsPlaying).toEqual([
    // Joining the call
    enterSound,
    // Bob leaves
    enterSound,
  ]);
});

test("plays a sound when a user leaves", () => {
  const audioIsPlaying: string[] = mockMediaPlay();
  const members = new Map([alice].map((p) => [p.userId, p]));
  const remoteParticipants = new Map(
    [aliceParticipant].map((p) => [p.identity, p]),
  );
  const liveKitRoom = new EmittableMockLivekitRoom({
    localParticipant,
    remoteParticipants,
  });

  const vm = new CallViewModel(
    mockMatrixRoom({
      client: {
        getUserId: () => "@carol:example.org",
      } as Partial<MatrixClient> as MatrixClient,
      getMember: (userId) => members.get(userId) ?? null,
    }),
    liveKitRoom as unknown as Room,
    {
      kind: E2eeType.PER_PARTICIPANT,
    },
    of(ConnectionState.Connected),
  );
  render(<CallEventAudioRenderer vm={vm} />);

  act(() => {
    liveKitRoom.removeParticipant(aliceParticipant);
  });
  expect(audioIsPlaying).toEqual([
    // Joining the call
    enterSound,
    // Alice leaves
    leaveSound,
  ]);
});

test("plays no sound when the participant list", () => {
  const audioIsPlaying: string[] = mockMediaPlay();
  const members = new Map([alice].map((p) => [p.userId, p]));
  const remoteParticipants = new Map<string, RemoteParticipant>([
    [aliceParticipant.identity, aliceParticipant],
    ...Array.from({ length: MAX_PARTICIPANT_COUNT_FOR_SOUND - 1 }).map<
      [string, RemoteParticipant]
    >((_, index) => {
      const p = mockRemoteParticipant({ identity: `user${index}` });
      return [p.identity, p];
    }),
  ]);
  const liveKitRoom = new EmittableMockLivekitRoom({
    localParticipant,
    remoteParticipants,
  });

  const vm = new CallViewModel(
    mockMatrixRoom({
      client: {
        getUserId: () => "@carol:example.org",
      } as Partial<MatrixClient> as MatrixClient,
      getMember: (userId) => members.get(userId) ?? null,
    }),
    liveKitRoom as unknown as Room,
    {
      kind: E2eeType.PER_PARTICIPANT,
    },
    of(ConnectionState.Connected),
  );
  render(<CallEventAudioRenderer vm={vm} />);
  expect(audioIsPlaying).toEqual([]);
  // When the count drops
  act(() => {
    liveKitRoom.removeParticipant(aliceParticipant);
  });
  expect(audioIsPlaying).toEqual([leaveSound]);
});

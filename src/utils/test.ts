/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/
import { map } from "rxjs";
import { RunHelpers, TestScheduler } from "rxjs/testing";
import { expect, vi } from "vitest";
import { RoomMember, Room as MatrixRoom } from "matrix-js-sdk/src/matrix";
import {
  LocalParticipant,
  LocalTrackPublication,
  RemoteParticipant,
  RemoteTrackPublication,
  Room as LivekitRoom,
} from "livekit-client";

import {
  LocalUserMediaViewModel,
  RemoteUserMediaViewModel,
} from "../state/MediaViewModel";

export function withFakeTimers(continuation: () => void): void {
  vi.useFakeTimers();
  try {
    continuation();
  } finally {
    vi.useRealTimers();
  }
}

export interface OurRunHelpers extends RunHelpers {
  /**
   * Schedules a sequence of actions to happen, as described by a marble
   * diagram.
   */
  schedule: (marbles: string, actions: Record<string, () => void>) => void;
}

/**
 * Run Observables with a scheduler that virtualizes time, for testing purposes.
 */
export function withTestScheduler(
  continuation: (helpers: OurRunHelpers) => void,
): void {
  new TestScheduler((actual, expected) => {
    expect(actual).deep.equals(expected);
  }).run((helpers) =>
    continuation({
      ...helpers,
      schedule(marbles, actions) {
        const actionsObservable = helpers
          .cold(marbles)
          .pipe(map((value) => actions[value]()));
        const results = Object.fromEntries(
          Object.keys(actions).map((value) => [value, undefined] as const),
        );
        // Run the actions and verify that none of them error
        helpers.expectObservable(actionsObservable).toBe(marbles, results);
      },
    }),
  );
}

interface EmitterMock<T> {
  on: () => T;
  off: () => T;
  addListener: () => T;
  removeListener: () => T;
}

function mockEmitter<T>(): EmitterMock<T> {
  return {
    on(): T {
      return this as T;
    },
    off(): T {
      return this as T;
    },
    addListener(): T {
      return this as T;
    },
    removeListener(): T {
      return this as T;
    },
  };
}

// Maybe it'd be good to move this to matrix-js-sdk? Our testing needs are
// rather simple, but if one util to mock a member is good enough for us, maybe
// it's useful for matrix-js-sdk consumers in general.
export function mockMember(member: Partial<RoomMember>): RoomMember {
  return { ...mockEmitter(), ...member } as RoomMember;
}

export function mockMatrixRoom(room: Partial<MatrixRoom>): MatrixRoom {
  return { ...mockEmitter(), ...room } as Partial<MatrixRoom> as MatrixRoom;
}

export function mockLivekitRoom(room: Partial<LivekitRoom>): LivekitRoom {
  return { ...mockEmitter(), ...room } as Partial<LivekitRoom> as LivekitRoom;
}

export function mockLocalParticipant(
  participant: Partial<LocalParticipant>,
): LocalParticipant {
  return {
    isLocal: true,
    getTrackPublication: () =>
      ({}) as Partial<LocalTrackPublication> as LocalTrackPublication,
    ...mockEmitter(),
    ...participant,
  } as Partial<LocalParticipant> as LocalParticipant;
}

export async function withLocalMedia(
  member: Partial<RoomMember>,
  continuation: (vm: LocalUserMediaViewModel) => void | Promise<void>,
): Promise<void> {
  const vm = new LocalUserMediaViewModel(
    "local",
    mockMember(member),
    mockLocalParticipant({}),
    true,
  );
  try {
    await continuation(vm);
  } finally {
    vm.destroy();
  }
}

export function mockRemoteParticipant(
  participant: Partial<RemoteParticipant>,
): RemoteParticipant {
  return {
    isLocal: false,
    setVolume() {},
    getTrackPublication: () =>
      ({}) as Partial<RemoteTrackPublication> as RemoteTrackPublication,
    ...mockEmitter(),
    ...participant,
  } as RemoteParticipant;
}

export async function withRemoteMedia(
  member: Partial<RoomMember>,
  participant: Partial<RemoteParticipant>,
  continuation: (vm: RemoteUserMediaViewModel) => void | Promise<void>,
): Promise<void> {
  const vm = new RemoteUserMediaViewModel(
    "remote",
    mockMember(member),
    mockRemoteParticipant(participant),
    true,
  );
  try {
    await continuation(vm);
  } finally {
    vm.destroy();
  }
}

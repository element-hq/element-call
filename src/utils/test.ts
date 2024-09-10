/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/
import { map } from "rxjs";
import { RunHelpers, TestScheduler } from "rxjs/testing";
import { expect, vi } from "vitest";
import { RoomMember } from "matrix-js-sdk/src/matrix";
import {
  LocalParticipant,
  LocalTrackPublication,
  RemoteParticipant,
  RemoteTrackPublication,
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

function mockMember(member: Partial<RoomMember>): RoomMember {
  return {
    on() {
      return this;
    },
    off() {
      return this;
    },
    addListener() {
      return this;
    },
    removeListener() {
      return this;
    },
    ...member,
  } as RoomMember;
}

export async function withLocalMedia(
  member: Partial<RoomMember>,
  continuation: (vm: LocalUserMediaViewModel) => void | Promise<void>,
): Promise<void> {
  const vm = new LocalUserMediaViewModel(
    "local",
    mockMember(member),
    {
      getTrackPublication: () =>
        ({}) as Partial<LocalTrackPublication> as LocalTrackPublication,
      on() {
        return this as LocalParticipant;
      },
      off() {
        return this as LocalParticipant;
      },
      addListener() {
        return this as LocalParticipant;
      },
      removeListener() {
        return this as LocalParticipant;
      },
    } as Partial<LocalParticipant> as LocalParticipant,
    true,
  );
  try {
    await continuation(vm);
  } finally {
    vm.destroy();
  }
}

export async function withRemoteMedia(
  member: Partial<RoomMember>,
  participant: Partial<RemoteParticipant>,
  continuation: (vm: RemoteUserMediaViewModel) => void | Promise<void>,
): Promise<void> {
  const vm = new RemoteUserMediaViewModel(
    "remote",
    mockMember(member),
    {
      setVolume() {},
      getTrackPublication: () =>
        ({}) as Partial<RemoteTrackPublication> as RemoteTrackPublication,
      on() {
        return this;
      },
      off() {
        return this;
      },
      addListener() {
        return this;
      },
      removeListener() {
        return this;
      },
      ...participant,
    } as RemoteParticipant,
    true,
  );
  try {
    await continuation(vm);
  } finally {
    vm.destroy();
  }
}

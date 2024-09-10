/*
Copyright 2023-2024 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
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
  continuation: (vm: LocalUserMediaViewModel) => Promise<void>,
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
  continuation: (vm: RemoteUserMediaViewModel) => Promise<void>,
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

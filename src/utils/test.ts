/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/
import { map, Observable, of, SchedulerLike } from "rxjs";
import { RunHelpers, TestScheduler } from "rxjs/testing";
import { expect, vi } from "vitest";
import { RoomMember, Room as MatrixRoom } from "matrix-js-sdk/src/matrix";
import {
  LocalParticipant,
  LocalTrackPublication,
  RemoteParticipant,
  RemoteTrackPublication,
  Room as LivekitRoom,
  RoomEvent,
} from "livekit-client";
import { EventEmitter } from "stream";

import {
  LocalUserMediaViewModel,
  RemoteUserMediaViewModel,
} from "../state/MediaViewModel";
import { E2eeType } from "../e2ee/e2eeType";
import { DEFAULT_CONFIG, ResolvedConfigOptions } from "../config/ConfigOptions";
import { Config } from "../config/Config";

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

interface TestRunnerGlobal {
  rxjsTestScheduler?: SchedulerLike;
}

/**
 * Run Observables with a scheduler that virtualizes time, for testing purposes.
 */
export function withTestScheduler(
  continuation: (helpers: OurRunHelpers) => void,
): void {
  const scheduler = new TestScheduler((actual, expected) => {
    expect(actual).deep.equals(expected);
  });
  // we set the test scheduler as a global so that you can watch it in a debugger
  // and get the frame number. e.g. `rxjsTestScheduler?.now()`
  (global as unknown as TestRunnerGlobal).rxjsTestScheduler = scheduler;
  scheduler.run((helpers) =>
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
export function mockMatrixRoomMember(member: Partial<RoomMember>): RoomMember {
  return { ...mockEmitter(), ...member } as RoomMember;
}

export function mockMatrixRoom(room: Partial<MatrixRoom>): MatrixRoom {
  return { ...mockEmitter(), ...room } as Partial<MatrixRoom> as MatrixRoom;
}

/**
 * A mock of a Livekit Room that can emit events.
 */
export class EmittableMockLivekitRoom extends EventEmitter {
  public localParticipant?: LocalParticipant;
  public remoteParticipants: Map<string, RemoteParticipant>;

  public constructor(room: {
    localParticipant?: LocalParticipant;
    remoteParticipants: Map<string, RemoteParticipant>;
  }) {
    super();
    this.localParticipant = room.localParticipant;
    this.remoteParticipants = room.remoteParticipants ?? new Map();
  }

  public addParticipant(remoteParticipant: RemoteParticipant): void {
    this.remoteParticipants.set(remoteParticipant.identity, remoteParticipant);
    this.emit(RoomEvent.ParticipantConnected, remoteParticipant);
  }

  public removeParticipant(remoteParticipant: RemoteParticipant): void {
    this.remoteParticipants.delete(remoteParticipant.identity);
    this.emit(RoomEvent.ParticipantDisconnected, remoteParticipant);
  }
}

export function mockLivekitRoom(
  room: Partial<LivekitRoom>,
  {
    remoteParticipants,
  }: { remoteParticipants?: Observable<RemoteParticipant[]> } = {},
): LivekitRoom {
  const livekitRoom = {
    ...mockEmitter(),
    ...room,
  } as Partial<LivekitRoom> as LivekitRoom;
  if (remoteParticipants) {
    livekitRoom.remoteParticipants = new Map();
    remoteParticipants.subscribe((newRemoteParticipants) => {
      livekitRoom.remoteParticipants.clear();
      newRemoteParticipants.forEach((p) => {
        livekitRoom.remoteParticipants.set(p.identity, p);
      });
    });
  }

  return livekitRoom;
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
  const localParticipant = mockLocalParticipant({});
  const vm = new LocalUserMediaViewModel(
    "local",
    mockMatrixRoomMember(member),
    localParticipant,
    {
      kind: E2eeType.PER_PARTICIPANT,
    },
    mockLivekitRoom({ localParticipant }),
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
  const remoteParticipant = mockRemoteParticipant(participant);
  const vm = new RemoteUserMediaViewModel(
    "remote",
    mockMatrixRoomMember(member),
    remoteParticipant,
    {
      kind: E2eeType.PER_PARTICIPANT,
    },
    mockLivekitRoom({}, { remoteParticipants: of([remoteParticipant]) }),
  );
  try {
    await continuation(vm);
  } finally {
    vm.destroy();
  }
}

export function mockConfig(config: Partial<ResolvedConfigOptions> = {}): void {
  vi.spyOn(Config, "get").mockReturnValue({
    ...DEFAULT_CONFIG,
    ...config,
  });
}

export function mockMediaPlay(): string[] {
  const audioIsPlaying: string[] = [];
  window.HTMLMediaElement.prototype.play = async function (): Promise<void> {
    audioIsPlaying.push((this.children[0] as HTMLSourceElement).src);
    return Promise.resolve();
  };
  return audioIsPlaying;
}

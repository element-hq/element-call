/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { RoomMember } from "matrix-js-sdk/src/matrix";
import { expect, test, vi } from "vitest";
import { LocalParticipant, RemoteParticipant } from "livekit-client";

import {
  LocalUserMediaViewModel,
  RemoteUserMediaViewModel,
} from "./MediaViewModel";
import { withTestScheduler } from "../utils/test";

function withLocal(continuation: (vm: LocalUserMediaViewModel) => void): void {
  const member = {} as unknown as RoomMember;
  const vm = new LocalUserMediaViewModel(
    "a",
    member,
    {} as unknown as LocalParticipant,
    true,
  );
  try {
    continuation(vm);
  } finally {
    vm.destroy();
  }
}

function withRemote(
  participant: Partial<RemoteParticipant>,
  continuation: (vm: RemoteUserMediaViewModel) => void,
): void {
  const member = {} as unknown as RoomMember;
  const vm = new RemoteUserMediaViewModel(
    "a",
    member,
    { setVolume() {}, ...participant } as RemoteParticipant,
    true,
  );
  try {
    continuation(vm);
  } finally {
    vm.destroy();
  }
}

test("set a participant's volume", () => {
  const setVolumeSpy = vi.fn();
  withRemote({ setVolume: setVolumeSpy }, (vm) =>
    withTestScheduler(({ expectObservable, schedule }) => {
      schedule("-a|", {
        a() {
          vm.setLocalVolume(0.8);
          expect(setVolumeSpy).toHaveBeenLastCalledWith(0.8);
        },
      });
      expectObservable(vm.localVolume).toBe("ab", { a: 1, b: 0.8 });
    }),
  );
});

test("mute and unmute a participant", () => {
  const setVolumeSpy = vi.fn();
  withRemote({ setVolume: setVolumeSpy }, (vm) =>
    withTestScheduler(({ expectObservable, schedule }) => {
      schedule("-abc|", {
        a() {
          vm.toggleLocallyMuted();
          expect(setVolumeSpy).toHaveBeenLastCalledWith(0);
        },
        b() {
          vm.setLocalVolume(0.8);
          expect(setVolumeSpy).toHaveBeenLastCalledWith(0);
        },
        c() {
          vm.toggleLocallyMuted();
          expect(setVolumeSpy).toHaveBeenLastCalledWith(0.8);
        },
      });
      expectObservable(vm.locallyMuted).toBe("ab-c", {
        a: false,
        b: true,
        c: false,
      });
    }),
  );
});

test("toggle fit/contain for a participant's video", () => {
  withRemote({}, (vm) =>
    withTestScheduler(({ expectObservable, schedule }) => {
      schedule("-ab|", {
        a: () => vm.toggleFitContain(),
        b: () => vm.toggleFitContain(),
      });
      expectObservable(vm.cropVideo).toBe("abc", {
        a: true,
        b: false,
        c: true,
      });
    }),
  );
});

test("local media remembers whether it should always be shown", () => {
  withLocal((vm) =>
    withTestScheduler(({ expectObservable, schedule }) => {
      schedule("-a|", { a: () => vm.setAlwaysShow(false) });
      expectObservable(vm.alwaysShow).toBe("ab", { a: true, b: false });
    }),
  );
  // Next local media should start out *not* always shown
  withLocal((vm) =>
    withTestScheduler(({ expectObservable, schedule }) => {
      schedule("-a|", { a: () => vm.setAlwaysShow(true) });
      expectObservable(vm.alwaysShow).toBe("ab", { a: false, b: true });
    }),
  );
});

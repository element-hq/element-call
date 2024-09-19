/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { expect, test, vi } from "vitest";

import {
  withLocalMedia,
  withRemoteMedia,
  withTestScheduler,
} from "../utils/test";

test("set a participant's volume", async () => {
  const setVolumeSpy = vi.fn();
  await withRemoteMedia({}, { setVolume: setVolumeSpy }, (vm) =>
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

test("mute and unmute a participant", async () => {
  const setVolumeSpy = vi.fn();
  await withRemoteMedia({}, { setVolume: setVolumeSpy }, (vm) =>
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

test("toggle fit/contain for a participant's video", async () => {
  await withRemoteMedia({}, {}, (vm) =>
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

test("local media remembers whether it should always be shown", async () => {
  await withLocalMedia({}, (vm) =>
    withTestScheduler(({ expectObservable, schedule }) => {
      schedule("-a|", { a: () => vm.setAlwaysShow(false) });
      expectObservable(vm.alwaysShow).toBe("ab", { a: true, b: false });
    }),
  );
  // Next local media should start out *not* always shown
  await withLocalMedia({}, (vm) =>
    withTestScheduler(({ expectObservable, schedule }) => {
      schedule("-a|", { a: () => vm.setAlwaysShow(true) });
      expectObservable(vm.alwaysShow).toBe("ab", { a: false, b: true });
    }),
  );
});

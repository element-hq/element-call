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

test("control a participant's volume", async () => {
  const setVolumeSpy = vi.fn();
  await withRemoteMedia({}, { setVolume: setVolumeSpy }, (vm) =>
    withTestScheduler(({ expectObservable, schedule }) => {
      schedule("-ab---c---d|", {
        a() {
          // Try muting by toggling
          vm.toggleLocallyMuted();
          expect(setVolumeSpy).toHaveBeenLastCalledWith(0);
        },
        b() {
          // Try unmuting by dragging the slider back up
          vm.setLocalVolume(0.6);
          vm.setLocalVolume(0.8);
          vm.commitLocalVolume();
          expect(setVolumeSpy).toHaveBeenCalledWith(0.6);
          expect(setVolumeSpy).toHaveBeenLastCalledWith(0.8);
        },
        c() {
          // Try muting by dragging the slider back down
          vm.setLocalVolume(0.2);
          vm.setLocalVolume(0);
          vm.commitLocalVolume();
          expect(setVolumeSpy).toHaveBeenCalledWith(0.2);
          expect(setVolumeSpy).toHaveBeenLastCalledWith(0);
        },
        d() {
          // Try unmuting by toggling
          vm.toggleLocallyMuted();
          // The volume should return to the last non-zero committed volume
          expect(setVolumeSpy).toHaveBeenLastCalledWith(0.8);
        },
      });
      expectObservable(vm.localVolume).toBe("ab(cd)(ef)g", {
        a: 1,
        b: 0,
        c: 0.6,
        d: 0.8,
        e: 0.2,
        f: 0,
        g: 0.8,
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

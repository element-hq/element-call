/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, onTestFinished, test, vi } from "vitest";
import {
  type LocalTrackPublication,
  LocalVideoTrack,
  TrackEvent,
} from "livekit-client";
import { waitFor } from "@testing-library/dom";

import {
  mockLocalParticipant,
  mockMediaDevices,
  mockRtcMembership,
  createLocalMedia,
  createRemoteMedia,
  withTestScheduler,
  mockRemoteParticipant,
} from "../utils/test";
import { getValue } from "../utils/observable";
import { constant } from "./Behavior";

global.MediaStreamTrack = class {} as unknown as {
  new (): MediaStreamTrack;
  prototype: MediaStreamTrack;
};
global.MediaStream = class {} as unknown as {
  new (): MediaStream;
  prototype: MediaStream;
};

const platformMock = vi.hoisted(() => vi.fn(() => "desktop"));
vi.mock("../Platform", () => ({
  get platform(): string {
    return platformMock();
  },
}));

const rtcMembership = mockRtcMembership("@alice:example.org", "AAAA");

test("control a participant's volume", () => {
  const setVolumeSpy = vi.fn();
  const vm = createRemoteMedia(
    rtcMembership,
    {},
    mockRemoteParticipant({ setVolume: setVolumeSpy }),
  );
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
    expectObservable(vm.localVolume$).toBe("ab(cd)(ef)g", {
      a: 1,
      b: 0,
      c: 0.6,
      d: 0.8,
      e: 0.2,
      f: 0,
      g: 0.8,
    });
  });
});

test("toggle fit/contain for a participant's video", () => {
  const vm = createRemoteMedia(rtcMembership, {}, mockRemoteParticipant({}));
  withTestScheduler(({ expectObservable, schedule }) => {
    schedule("-ab|", {
      a: () => vm.toggleFitContain(),
      b: () => vm.toggleFitContain(),
    });
    expectObservable(vm.cropVideo$).toBe("abc", {
      a: true,
      b: false,
      c: true,
    });
  });
});

test("local media remembers whether it should always be shown", () => {
  const vm1 = createLocalMedia(
    rtcMembership,
    {},
    mockLocalParticipant({}),
    mockMediaDevices({}),
  );
  withTestScheduler(({ expectObservable, schedule }) => {
    schedule("-a|", { a: () => vm1.setAlwaysShow(false) });
    expectObservable(vm1.alwaysShow$).toBe("ab", { a: true, b: false });
  });

  // Next local media should start out *not* always shown
  const vm2 = createLocalMedia(
    rtcMembership,
    {},
    mockLocalParticipant({}),
    mockMediaDevices({}),
  );
  withTestScheduler(({ expectObservable, schedule }) => {
    schedule("-a|", { a: () => vm2.setAlwaysShow(true) });
    expectObservable(vm2.alwaysShow$).toBe("ab", { a: false, b: true });
  });
});

test("switch cameras", async () => {
  // Camera switching is only available on mobile
  platformMock.mockReturnValue("android");
  onTestFinished(() => void platformMock.mockReset());

  // Construct a mock video track which knows how to be restarted
  const track = new LocalVideoTrack({
    getConstraints() {},
    addEventListener() {},
    removeEventListener() {},
  } as unknown as MediaStreamTrack);

  let deviceId = "front camera";
  const restartTrack = vi.fn(async ({ facingMode }) => {
    deviceId = facingMode === "user" ? "front camera" : "back camera";
    track.emit(TrackEvent.Restarted);
    return Promise.resolve();
  });
  track.restartTrack = restartTrack;

  Object.defineProperty(track, "mediaStreamTrack", {
    get() {
      return {
        label: "Video",
        getSettings: (): object => ({
          deviceId,
          facingMode: deviceId === "front camera" ? "user" : "environment",
        }),
      };
    },
  });

  const selectVideoInput = vi.fn();

  const vm = createLocalMedia(
    rtcMembership,
    {},
    mockLocalParticipant({
      getTrackPublication() {
        return { track } as unknown as LocalTrackPublication;
      },
    }),
    mockMediaDevices({
      videoInput: {
        available$: constant(new Map()),
        selected$: constant(undefined),
        select: selectVideoInput,
      },
    }),
  );

  // Switch to back camera
  getValue(vm.switchCamera$)!();
  expect(restartTrack).toHaveBeenCalledExactlyOnceWith({
    facingMode: "environment",
  });
  await waitFor(() => {
    expect(selectVideoInput).toHaveBeenCalledTimes(1);
    expect(selectVideoInput).toHaveBeenCalledWith("back camera");
  });
  expect(deviceId).toBe("back camera");

  // Switch to front camera
  getValue(vm.switchCamera$)!();
  expect(restartTrack).toHaveBeenCalledTimes(2);
  expect(restartTrack).toHaveBeenLastCalledWith({ facingMode: "user" });
  await waitFor(() => {
    expect(selectVideoInput).toHaveBeenCalledTimes(2);
    expect(selectVideoInput).toHaveBeenLastCalledWith("front camera");
  });
  expect(deviceId).toBe("front camera");
});

test("remote media is in waiting state when participant has not yet connected", () => {
  const vm = createRemoteMedia(rtcMembership, {}, null); // null participant
  expect(vm.waitingForMedia$.value).toBe(true);
});

test("remote media is not in waiting state when participant is connected", () => {
  const vm = createRemoteMedia(rtcMembership, {}, mockRemoteParticipant({}));
  expect(vm.waitingForMedia$.value).toBe(false);
});

test("remote media is not in waiting state when participant is connected with no publications", () => {
  const vm = createRemoteMedia(
    rtcMembership,
    {},
    mockRemoteParticipant({
      getTrackPublication: () => undefined,
      getTrackPublications: () => [],
    }),
  );
  expect(vm.waitingForMedia$.value).toBe(false);
});

test("remote media is not in waiting state when user does not intend to publish anywhere", () => {
  const vm = createRemoteMedia(
    rtcMembership,
    {},
    mockRemoteParticipant({}),
    undefined, // No room (no advertised transport)
  );
  expect(vm.waitingForMedia$.value).toBe(false);
});

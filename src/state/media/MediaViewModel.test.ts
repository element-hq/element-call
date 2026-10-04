/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, onTestFinished, test, vi } from "vitest";
import {
  type Behavior,
  constant,
  type MediaStreamStats,
} from "@element-hq/matrixrtc-sdk";
import { waitFor } from "@testing-library/dom";
import { BehaviorSubject } from "rxjs";

import {
  mockAudioTrack,
  mockLocalMedia,
  mockMediaDevices,
  mockMemberMedia,
  mockRemoteMedia,
  mockRemoteScreenShare,
  mockRtcMembership,
  mockVideoTrack,
  withTestScheduler,
} from "../../utils/test";
import { showConnectionStats } from "../../settings/settings";

const platformMock = vi.hoisted(() => vi.fn(() => "desktop"));
vi.mock("../../Platform", () => ({
  get platform(): string {
    return platformMock();
  },
}));

const rtcMembership = mockRtcMembership("@alice:example.org", "AAAA");

test("control a participant's volume", () => {
  const setVolume = vi.fn();
  const vm = mockRemoteMedia(
    rtcMembership,
    {},
    mockMemberMedia({
      tracks$: constant([mockAudioTrack({ setVolume })]),
    }),
  );
  withTestScheduler(({ expectObservable, schedule }) => {
    schedule("-ab---c---d|", {
      a() {
        // Try muting by toggling
        vm.togglePlaybackMuted();
        expect(setVolume).toHaveBeenLastCalledWith(0);
      },
      b() {
        // Try unmuting by dragging the slider back up
        vm.adjustPlaybackVolume(0.6);
        vm.adjustPlaybackVolume(0.8);
        vm.commitPlaybackVolume();
        expect(setVolume).toHaveBeenCalledWith(0.6);
        expect(setVolume).toHaveBeenLastCalledWith(0.8);
      },
      c() {
        // Try muting by dragging the slider back down
        vm.adjustPlaybackVolume(0.2);
        vm.adjustPlaybackVolume(0);
        vm.commitPlaybackVolume();
        expect(setVolume).toHaveBeenCalledWith(0.2);
        expect(setVolume).toHaveBeenLastCalledWith(0);
      },
      d() {
        // Try unmuting by toggling
        vm.togglePlaybackMuted();
        // The volume should return to the last non-zero committed volume
        expect(setVolume).toHaveBeenLastCalledWith(0.8);
      },
    });
    expectObservable(vm.playbackVolume$).toBe("ab(cd)(ef)g", {
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

test("control a participant's screen share volume", () => {
  const setVolume = vi.fn();
  const vm = mockRemoteScreenShare(
    rtcMembership,
    {},
    mockMemberMedia({
      tracks$: constant([
        mockAudioTrack({ source: "screenShareAudio", setVolume }),
      ]),
    }),
  );
  withTestScheduler(({ expectObservable, schedule }) => {
    schedule("-ab---c---d|", {
      a() {
        vm.togglePlaybackMuted();
        expect(setVolume).toHaveBeenLastCalledWith(0);
      },
      b() {
        vm.adjustPlaybackVolume(0.6);
        vm.adjustPlaybackVolume(0.8);
        vm.commitPlaybackVolume();
        expect(setVolume).toHaveBeenCalledWith(0.6);
        expect(setVolume).toHaveBeenLastCalledWith(0.8);
      },
      c() {
        vm.adjustPlaybackVolume(0.2);
        vm.adjustPlaybackVolume(0);
        vm.commitPlaybackVolume();
        expect(setVolume).toHaveBeenCalledWith(0.2);
        expect(setVolume).toHaveBeenLastCalledWith(0);
      },
      d() {
        vm.togglePlaybackMuted();
        expect(setVolume).toHaveBeenLastCalledWith(0.8);
      },
    });
    expectObservable(vm.playbackVolume$).toBe("ab(cd)(ef)g", {
      a: 1,
      b: 0,
      c: 0.6,
      d: 0.8,
      e: 0.2,
      f: 0,
      g: 0.8,
    });
  });
  expect(vm.audioEnabled$.value).toBe(true);
});

test("local media remembers whether it should always be shown", () => {
  const vm1 = mockLocalMedia(
    rtcMembership,
    {},
    mockMemberMedia({ local: true }),
    mockMediaDevices({}),
  );
  withTestScheduler(({ expectObservable, schedule }) => {
    schedule("-a|", { a: () => vm1.setAlwaysShow(false) });
    expectObservable(vm1.alwaysShow$).toBe("ab", { a: true, b: false });
  });
  // Next local media should start out *not* always shown
  const vm2 = mockLocalMedia(
    rtcMembership,
    {},
    mockMemberMedia({ local: true }),
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
  const facingMode$ = new BehaviorSubject<"user" | "environment" | undefined>(
    "user",
  );
  // The SDK restarts the camera the other way round and says which device it
  // ended up on
  const switchFacingMode = vi.fn(async (): Promise<string> => {
    const back = facingMode$.value === "user";
    facingMode$.next(back ? "environment" : "user");
    return Promise.resolve(back ? "back camera" : "front camera");
  });
  const selectVideoInput = vi.fn();
  const vm = mockLocalMedia(
    rtcMembership,
    {},
    mockMemberMedia({
      local: true,
      tracks$: constant([mockVideoTrack({ facingMode$, switchFacingMode })]),
    }),
    mockMediaDevices({
      videoInput: {
        available$: constant(new Map()),
        selected$: constant(undefined),
        select: selectVideoInput,
      },
    }),
  );
  expect(vm.mirror$.value).toBe(true);

  // Switch to back camera
  vm.switchCamera$.value!();
  expect(switchFacingMode).toHaveBeenCalledTimes(1);
  await waitFor(() => {
    expect(selectVideoInput).toHaveBeenCalledWith("back camera");
  });
  expect(vm.mirror$.value).toBe(false);

  // Switch to front camera
  vm.switchCamera$.value!();
  expect(switchFacingMode).toHaveBeenCalledTimes(2);
  await waitFor(() => {
    expect(selectVideoInput).toHaveBeenLastCalledWith("front camera");
  });
  expect(vm.mirror$.value).toBe(true);
});

test("no camera switch where the facing mode is unknown", () => {
  platformMock.mockReturnValue("android");
  onTestFinished(() => void platformMock.mockReset());
  const vm = mockLocalMedia(
    rtcMembership,
    {},
    mockMemberMedia({ local: true, tracks$: constant([mockVideoTrack()]) }),
    mockMediaDevices({}),
  );
  expect(vm.switchCamera$.value).toBeNull();
});

test("remote media is in waiting state while its media has not arrived", () => {
  const vm = mockRemoteMedia(rtcMembership, {}, null);
  expect(vm.waitingForMedia$.value).toBe(true);
});

test("remote media is not in waiting state once its media is there", () => {
  const vm = mockRemoteMedia(rtcMembership, {}, mockMemberMedia());
  expect(vm.waitingForMedia$.value).toBe(false);
});

test("remote media is not in waiting state when user does not intend to publish anywhere", () => {
  const vm = mockRemoteMedia(rtcMembership, {}, null, {});
  expect(vm.waitingForMedia$.value).toBe(false);
});

test("audio and video follow the tracks' mute state", () => {
  const vm = mockRemoteMedia(
    rtcMembership,
    {},
    mockMemberMedia({
      tracks$: constant([
        mockAudioTrack({ muted$: constant(false) }),
        mockVideoTrack({ muted$: constant(true) }),
      ]),
    }),
  );
  expect(vm.audioEnabled$.value).toBe(true);
  expect(vm.videoEnabled$.value).toBe(false);
});

test("user media polls stream stats only while the setting is on", () => {
  onTestFinished(() => showConnectionStats.setValue(false));
  withTestScheduler(({ cold, expectObservable, schedule }) => {
    const stats = { type: "inbound-rtp" } as RTCInboundRtpStreamStats;
    // A behavior that only runs its source while subscribed, as the SDK's does
    const vm = mockRemoteMedia(
      rtcMembership,
      {},
      mockMemberMedia({
        tracks$: constant([
          mockAudioTrack({
            stats$: cold("-s", {
              s: stats,
            }) as unknown as Behavior<MediaStreamStats>,
          }),
        ]),
      }),
    );
    schedule("-a-b", {
      a() {
        showConnectionStats.setValue(true);
      },
      b() {
        showConnectionStats.setValue(false);
      },
    });
    expectObservable(vm.audioStreamStats$).toBe("u-su", {
      u: undefined,
      s: stats,
    });
  });
});

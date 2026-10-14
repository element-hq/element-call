/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, render, type RenderResult } from "@testing-library/react";
import { type Behavior, type RemoteRTCMember } from "@element-hq/matrixrtc-sdk";
import { BehaviorSubject } from "rxjs";

import { MediaDevicesContext } from "../MediaDevicesContext";
import { MemberAudioRenderer } from "./MemberAudioRenderer";
import {
  mockAudioTrack,
  mockMediaDevices,
  mockRTCMember,
  mockRtcMembership,
  type MockTracks,
  mockVideoTrack,
} from "../utils/test";

/** The renderer creates one for the earpiece graph; jsdom has none. */
class FakeAudioContext {
  public createGain(): unknown {
    return { gain: { value: 1 } };
  }
  public createStereoPanner(): unknown {
    return { pan: { value: 0 } };
  }
  public async close(): Promise<void> {}
}

beforeEach(() => {
  vi.stubGlobal("AudioContext", FakeAudioContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderMembers(
  members: { id: string; tracks$: Behavior<MockTracks> }[],
): RenderResult {
  const rtcMembers: RemoteRTCMember[] = members.map(({ id, tracks$ }) =>
    mockRTCMember(false, {
      membership: mockRtcMembership(`@${id}:example.org`, "DEVICE"),
      tracks$,
    }),
  );
  return render(
    <MediaDevicesContext.Provider value={mockMediaDevices({})}>
      <MemberAudioRenderer members={rtcMembers} />
    </MediaDevicesContext.Provider>,
  );
}

test("plays nothing for a member whose media has not arrived", () => {
  const { queryAllByTestId } = renderMembers([
    { id: "alice", tracks$: new BehaviorSubject<MockTracks>(null) },
  ]);
  expect(queryAllByTestId("audio")).toHaveLength(0);
});

test("plays the microphone and the screen share audio, and nothing else", () => {
  const microphone = mockAudioTrack({ id: "mic" });
  const screenShareAudio = mockAudioTrack({
    id: "share-audio",
    source: "screenShareAudio",
  });
  const camera = mockVideoTrack({ id: "camera" });
  const unknownAudio = mockAudioTrack({ id: "unknown", source: "unknown" });
  const { queryAllByTestId } = renderMembers([
    {
      id: "alice",
      tracks$: new BehaviorSubject<MockTracks>([
        microphone,
        camera,
        screenShareAudio,
        unknownAudio,
      ]),
    },
  ]);
  expect(queryAllByTestId("audio")).toHaveLength(2);
  expect(microphone.attach).toHaveBeenCalledTimes(1);
  expect(screenShareAudio.attach).toHaveBeenCalledTimes(1);
  expect(camera.attach).not.toHaveBeenCalled();
  expect(unknownAudio.attach).not.toHaveBeenCalled();
});

test("starts playing once the member's tracks arrive", () => {
  const tracks$ = new BehaviorSubject<MockTracks>(null);
  const { queryAllByTestId } = renderMembers([{ id: "alice", tracks$ }]);
  expect(queryAllByTestId("audio")).toHaveLength(0);

  const microphone = mockAudioTrack({ id: "mic" });
  act(() => tracks$.next([microphone]));
  expect(queryAllByTestId("audio")).toHaveLength(1);
  expect(microphone.attach).toHaveBeenCalledTimes(1);
});

/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { render } from "@testing-library/react";
import {
  afterAll,
  beforeEach,
  expect,
  type MockedFunction,
  test,
  vitest,
  afterEach,
} from "vitest";
import { act } from "react";
import { type CallMembership } from "matrix-js-sdk/lib/matrixrtc";

import { mockRtcMembership } from "../utils/test";
import { CallEventAudioRenderer } from "./CallEventAudioRenderer";
import { useAudioContext } from "../useAudioContext";
import { prefetchSounds } from "../soundUtils";
import { getBasicCallViewModelEnvironment } from "../utils/test-viewmodel";
import {
  alice,
  aliceRtcMember,
  bobRtcMember,
  local,
  localRtcMember,
} from "../utils/test-fixtures";
import { MAX_PARTICIPANT_COUNT_FOR_SOUND } from "../state/CallViewModel";

vitest.mock("../useAudioContext");
vitest.mock("../soundUtils");

afterEach(() => {
  vitest.resetAllMocks();
});

afterAll(() => {
  vitest.restoreAllMocks();
});

let playSound: MockedFunction<
  NonNullable<ReturnType<typeof useAudioContext>>["playSound"]
>;

beforeEach(() => {
  (prefetchSounds as MockedFunction<typeof prefetchSounds>).mockResolvedValue({
    sound: new ArrayBuffer(0),
  });
  playSound = vitest.fn();
  (useAudioContext as MockedFunction<typeof useAudioContext>).mockReturnValue({
    playSound,
    playSoundLooping: vitest.fn(),
    soundDuration: {},
  });
});

/**
 * We don't want to play a sound when loading the call state
 * because typically this occurs in two stages. We first join
 * the call as a local participant and *then* the remote
 * participants join from our perspective. We don't want to make
 * a noise every time.
 */
test("plays one sound when entering a call", () => {
  const { vm, rtcMemberships$ } = getBasicCallViewModelEnvironment([
    local,
    alice,
  ]);
  render(<CallEventAudioRenderer vm={vm} />);

  // Joining a call usually means remote participants are added later.
  act(() => {
    rtcMemberships$.next([localRtcMember, aliceRtcMember, bobRtcMember]);
  });
  expect(playSound).toHaveBeenCalledOnce();
});

test("plays a sound when a user joins", () => {
  const { vm, rtcMemberships$ } = getBasicCallViewModelEnvironment([
    local,
    alice,
  ]);
  render(<CallEventAudioRenderer vm={vm} />);

  act(() => {
    rtcMemberships$.next([localRtcMember, aliceRtcMember, bobRtcMember]);
  });
  // Play a sound when joining a call.
  expect(playSound).toBeCalledWith("join");
});

test("plays a sound when a user leaves", () => {
  const { vm, rtcMemberships$ } = getBasicCallViewModelEnvironment([
    local,
    alice,
  ]);
  render(<CallEventAudioRenderer vm={vm} />);

  act(() => {
    rtcMemberships$.next([localRtcMember]);
  });
  expect(playSound).toBeCalledWith("left");
});

test("does not play a sound before the call is successful", () => {
  const { vm, rtcMemberships$ } = getBasicCallViewModelEnvironment(
    [local, alice],
    [localRtcMember],
    { waitForCallPickup: true },
  );
  render(<CallEventAudioRenderer vm={vm} />);

  act(() => {
    rtcMemberships$.next([localRtcMember]);
  });
  expect(playSound).not.toBeCalledWith("left");
});

test("plays no sound when the participant list is more than the maximum size", () => {
  const mockRtcMemberships: CallMembership[] = [localRtcMember];
  for (let i = 0; i < MAX_PARTICIPANT_COUNT_FOR_SOUND; i++) {
    mockRtcMemberships.push(
      mockRtcMembership(`@user${i}:example.org`, `DEVICE${i}`),
    );
  }

  const { vm, rtcMemberships$ } = getBasicCallViewModelEnvironment(
    [local, alice],
    mockRtcMemberships,
  );

  render(<CallEventAudioRenderer vm={vm} />);
  expect(playSound).not.toBeCalled();
  // Remove the last membership in the array to test the leaving sound
  // (The array has length MAX_PARTICIPANT_COUNT_FOR_SOUND + 1)
  act(() => {
    rtcMemberships$.next(
      mockRtcMemberships.slice(0, MAX_PARTICIPANT_COUNT_FOR_SOUND),
    );
  });
  expect(playSound).toBeCalledWith("left");
});

test("plays one sound when a hand is raised", () => {
  const { vm, handRaisedSubject$ } = getBasicCallViewModelEnvironment([
    local,
    alice,
  ]);
  render(<CallEventAudioRenderer vm={vm} />);

  act(() => {
    handRaisedSubject$.next({
      [bobRtcMember.callId]: {
        time: new Date(),
        membershipEventId: "",
        reactionEventId: "",
      },
    });
  });
  expect(playSound).toBeCalledWith("raiseHand");
});

test("should not play a sound when a hand raise is retracted", () => {
  const { vm, handRaisedSubject$ } = getBasicCallViewModelEnvironment([
    local,
    alice,
  ]);
  render(<CallEventAudioRenderer vm={vm} />);

  playSound.mockClear();
  act(() => {
    handRaisedSubject$.next({
      ["foo"]: {
        time: new Date(),
        membershipEventId: "",
        reactionEventId: "",
      },
      ["bar"]: {
        time: new Date(),
        membershipEventId: "",
        reactionEventId: "",
      },
    });
  });
  expect(playSound).toHaveBeenCalledExactlyOnceWith("raiseHand");
  act(() => {
    handRaisedSubject$.next({
      ["foo"]: {
        time: new Date(),
        membershipEventId: "",
        reactionEventId: "",
      },
    });
  });
  expect(playSound).toHaveBeenCalledExactlyOnceWith("raiseHand");
});

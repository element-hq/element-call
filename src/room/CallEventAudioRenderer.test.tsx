/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
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
import { type CallMembership } from "matrix-js-sdk/src/matrixrtc";

import { mockRtcMembership } from "../utils/test";
import {
  CallEventAudioRenderer,
  MAX_PARTICIPANT_COUNT_FOR_SOUND,
} from "./CallEventAudioRenderer";
import { useAudioContext } from "../useAudioContext";
import { prefetchSounds } from "../soundUtils";
import { getBasicCallViewModelEnvironment } from "../utils/test-viewmodel";
import {
  alice,
  aliceRtcMember,
  bobRtcMember,
  local,
} from "../utils/test-fixtures";

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
  const { vm, remoteRtcMemberships$ } = getBasicCallViewModelEnvironment([
    local,
    alice,
  ]);
  render(<CallEventAudioRenderer vm={vm} />);

  // Joining a call usually means remote participants are added later.
  act(() => {
    remoteRtcMemberships$.next([aliceRtcMember, bobRtcMember]);
  });
  expect(playSound).toHaveBeenCalledOnce();
});

test("plays a sound when a user joins", () => {
  const { vm, remoteRtcMemberships$ } = getBasicCallViewModelEnvironment([
    local,
    alice,
  ]);
  render(<CallEventAudioRenderer vm={vm} />);

  act(() => {
    remoteRtcMemberships$.next([aliceRtcMember, bobRtcMember]);
  });
  // Play a sound when joining a call.
  expect(playSound).toBeCalledWith("join");
});

test("plays a sound when a user leaves", () => {
  const { vm, remoteRtcMemberships$ } = getBasicCallViewModelEnvironment([
    local,
    alice,
  ]);
  render(<CallEventAudioRenderer vm={vm} />);

  act(() => {
    remoteRtcMemberships$.next([]);
  });
  expect(playSound).toBeCalledWith("left");
});

test("plays no sound when the participant list is more than the maximum size", () => {
  const mockRtcMemberships: CallMembership[] = [];
  for (let i = 0; i < MAX_PARTICIPANT_COUNT_FOR_SOUND; i++) {
    mockRtcMemberships.push(
      mockRtcMembership(`@user${i}:example.org`, `DEVICE${i}`),
    );
  }

  const { vm, remoteRtcMemberships$ } = getBasicCallViewModelEnvironment(
    [local, alice],
    mockRtcMemberships,
  );

  render(<CallEventAudioRenderer vm={vm} />);
  expect(playSound).not.toBeCalled();
  act(() => {
    remoteRtcMemberships$.next(
      mockRtcMemberships.slice(0, MAX_PARTICIPANT_COUNT_FOR_SOUND - 1),
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
  expect(playSound).toHaveBeenCalledTimes(2);
  act(() => {
    handRaisedSubject$.next({
      ["foo"]: {
        time: new Date(),
        membershipEventId: "",
        reactionEventId: "",
      },
    });
  });
  expect(playSound).toHaveBeenCalledTimes(2);
});

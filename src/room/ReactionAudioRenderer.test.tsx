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
  test,
  vitest,
  MockedFunction,
  Mock,
} from "vitest";
import { TooltipProvider } from "@vector-im/compound-web";
import { act, ReactNode } from "react";
import { afterEach } from "node:test";

import {
  MockRoom,
  MockRTCSession,
  TestReactionsWrapper,
} from "../utils/testReactions";
import { ReactionsAudioRenderer } from "./ReactionAudioRenderer";
import {
  playReactionsSound,
  soundEffectVolumeSetting,
} from "../settings/settings";
import { useAudioContext } from "../useAudioContext";
import { GenericReaction, ReactionSet } from "../reactions";
import { prefetchSounds } from "../soundUtils";

const memberUserIdAlice = "@alice:example.org";
const memberUserIdBob = "@bob:example.org";
const memberUserIdCharlie = "@charlie:example.org";
const memberEventAlice = "$membership-alice:example.org";
const memberEventBob = "$membership-bob:example.org";
const memberEventCharlie = "$membership-charlie:example.org";

const membership: Record<string, string> = {
  [memberEventAlice]: memberUserIdAlice,
  [memberEventBob]: memberUserIdBob,
  [memberEventCharlie]: memberUserIdCharlie,
};

function TestComponent({
  rtcSession,
}: {
  rtcSession: MockRTCSession;
}): ReactNode {
  return (
    <TooltipProvider>
      <TestReactionsWrapper rtcSession={rtcSession}>
        <ReactionsAudioRenderer />
      </TestReactionsWrapper>
    </TooltipProvider>
  );
}

vitest.mock("../useAudioContext");
vitest.mock("../soundUtils");

afterEach(() => {
  vitest.resetAllMocks();
  playReactionsSound.setValue(playReactionsSound.defaultValue);
  soundEffectVolumeSetting.setValue(soundEffectVolumeSetting.defaultValue);
});

afterAll(() => {
  vitest.restoreAllMocks();
});

let playSound: Mock<
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

test("preloads all audio elements", () => {
  playReactionsSound.setValue(true);
  const rtcSession = new MockRTCSession(
    new MockRoom(memberUserIdAlice),
    membership,
  );
  render(<TestComponent rtcSession={rtcSession} />);
  expect(prefetchSounds).toHaveBeenCalledOnce();
});

test("will play an audio sound when there is a reaction", () => {
  playReactionsSound.setValue(true);
  const room = new MockRoom(memberUserIdAlice);
  const rtcSession = new MockRTCSession(room, membership);
  render(<TestComponent rtcSession={rtcSession} />);

  // Find the first reaction with a sound effect
  const chosenReaction = ReactionSet.find((r) => !!r.sound);
  if (!chosenReaction) {
    throw Error(
      "No reactions have sounds configured, this test cannot succeed",
    );
  }
  act(() => {
    room.testSendReaction(memberEventAlice, chosenReaction, membership);
  });
  expect(playSound).toHaveBeenCalledWith(chosenReaction.name);
});

test("will play the generic audio sound when there is soundless reaction", () => {
  playReactionsSound.setValue(true);
  const room = new MockRoom(memberUserIdAlice);
  const rtcSession = new MockRTCSession(room, membership);
  render(<TestComponent rtcSession={rtcSession} />);

  // Find the first reaction with a sound effect
  const chosenReaction = ReactionSet.find((r) => !r.sound);
  if (!chosenReaction) {
    throw Error(
      "No reactions have sounds configured, this test cannot succeed",
    );
  }
  act(() => {
    room.testSendReaction(memberEventAlice, chosenReaction, membership);
  });
  expect(playSound).toHaveBeenCalledWith(GenericReaction.name);
});

test("will play multiple audio sounds when there are multiple different reactions", () => {
  playReactionsSound.setValue(true);

  const room = new MockRoom(memberUserIdAlice);
  const rtcSession = new MockRTCSession(room, membership);
  render(<TestComponent rtcSession={rtcSession} />);

  // Find the first reaction with a sound effect
  const [reaction1, reaction2] = ReactionSet.filter((r) => !!r.sound);
  if (!reaction1 || !reaction2) {
    throw Error(
      "No reactions have sounds configured, this test cannot succeed",
    );
  }
  act(() => {
    room.testSendReaction(memberEventAlice, reaction1, membership);
    room.testSendReaction(memberEventBob, reaction2, membership);
    room.testSendReaction(memberEventCharlie, reaction1, membership);
  });
  expect(playSound).toHaveBeenCalledWith(reaction1.name);
  expect(playSound).toHaveBeenCalledWith(reaction2.name);
});

/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { render } from "@testing-library/react";
import { afterAll, expect, test } from "vitest";
import { TooltipProvider } from "@vector-im/compound-web";
import { act, ReactNode } from "react";

import {
  MockRoom,
  MockRTCSession,
  TestReactionsWrapper,
} from "../utils/testReactions";
import { ReactionsAudioRenderer } from "./ReactionAudioRenderer";
import { GenericReaction, ReactionSet } from "../reactions";
import {
  playReactionsSound,
  soundEffectVolumeSetting,
} from "../settings/settings";
import { mockMediaPlay } from "../utils/test";

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

const originalPlayFn = window.HTMLMediaElement.prototype.play;
afterAll(() => {
  playReactionsSound.setValue(playReactionsSound.defaultValue);
  soundEffectVolumeSetting.setValue(soundEffectVolumeSetting.defaultValue);
  window.HTMLMediaElement.prototype.play = originalPlayFn;
});

test("preloads all audio elements", () => {
  playReactionsSound.setValue(true);
  const rtcSession = new MockRTCSession(
    new MockRoom(memberUserIdAlice),
    membership,
  );
  const { container } = render(<TestComponent rtcSession={rtcSession} />);
  expect(container.getElementsByTagName("audio")).toHaveLength(
    // All reactions plus the generic sound
    ReactionSet.filter((r) => r.sound).length + 1,
  );
});

test("loads no audio elements when disabled in settings", () => {
  playReactionsSound.setValue(false);
  const rtcSession = new MockRTCSession(
    new MockRoom(memberUserIdAlice),
    membership,
  );
  const { container } = render(<TestComponent rtcSession={rtcSession} />);
  expect(container.getElementsByTagName("audio")).toHaveLength(0);
});

test("will play an audio sound when there is a reaction", () => {
  const audioIsPlaying: string[] = mockMediaPlay();
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
  expect(audioIsPlaying).toHaveLength(1);
  expect(audioIsPlaying[0]).toContain(chosenReaction.sound?.ogg);
});

test("will play the generic audio sound when there is soundless reaction", () => {
  const audioIsPlaying: string[] = mockMediaPlay();
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
  expect(audioIsPlaying).toHaveLength(1);
  expect(audioIsPlaying[0]).toContain(GenericReaction.sound?.ogg);
});

test("will play an audio sound with the correct volume", () => {
  playReactionsSound.setValue(true);
  soundEffectVolumeSetting.setValue(0.5);
  const room = new MockRoom(memberUserIdAlice);
  const rtcSession = new MockRTCSession(room, membership);
  const { getByTestId } = render(<TestComponent rtcSession={rtcSession} />);

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
  expect((getByTestId(chosenReaction.name) as HTMLAudioElement).volume).toEqual(
    0.5,
  );
});

test("will play multiple audio sounds when there are multiple different reactions", () => {
  const audioIsPlaying: string[] = mockMediaPlay();
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
  expect(audioIsPlaying).toHaveLength(2);
  expect(audioIsPlaying[0]).toContain(reaction1.sound?.ogg);
  expect(audioIsPlaying[1]).toContain(reaction2.sound?.ogg);
});

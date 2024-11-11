/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { TooltipProvider } from "@vector-im/compound-web";
import { act, ReactNode } from "react";
import { afterEach } from "node:test";

import {
  MockRoom,
  MockRTCSession,
  TestReactionsWrapper,
} from "../utils/testReactions";
import { showReactions } from "../settings/settings";
import { ReactionsOverlay } from "./ReactionsOverlay";
import { ReactionSet } from "../reactions";

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
        <ReactionsOverlay />
      </TestReactionsWrapper>
    </TooltipProvider>
  );
}

afterEach(() => {
  showReactions.setValue(showReactions.defaultValue);
});

test("defaults to showing no reactions", () => {
  showReactions.setValue(true);
  const rtcSession = new MockRTCSession(
    new MockRoom(memberUserIdAlice),
    membership,
  );
  const { container } = render(<TestComponent rtcSession={rtcSession} />);
  expect(container.getElementsByTagName("span")).toHaveLength(0);
});

test("shows a reaction when sent", () => {
  showReactions.setValue(true);
  const reaction = ReactionSet[0];
  const room = new MockRoom(memberUserIdAlice);
  const rtcSession = new MockRTCSession(room, membership);
  const { getByRole } = render(<TestComponent rtcSession={rtcSession} />);
  act(() => {
    room.testSendReaction(memberEventAlice, reaction, membership);
  });
  const span = getByRole("presentation");
  expect(getByRole("presentation")).toBeTruthy();
  expect(span.innerHTML).toEqual(reaction.emoji);
});

test("shows two of the same reaction when sent", () => {
  showReactions.setValue(true);
  const reaction = ReactionSet[0];
  const room = new MockRoom(memberUserIdAlice);
  const rtcSession = new MockRTCSession(room, membership);
  const { getAllByRole } = render(<TestComponent rtcSession={rtcSession} />);
  act(() => {
    room.testSendReaction(memberEventAlice, reaction, membership);
  });
  act(() => {
    room.testSendReaction(memberEventBob, reaction, membership);
  });
  expect(getAllByRole("presentation")).toHaveLength(2);
});

test("shows two different reactions when sent", () => {
  showReactions.setValue(true);
  const room = new MockRoom(memberUserIdAlice);
  const rtcSession = new MockRTCSession(room, membership);
  const [reactionA, reactionB] = ReactionSet;
  const { getAllByRole } = render(<TestComponent rtcSession={rtcSession} />);
  act(() => {
    room.testSendReaction(memberEventAlice, reactionA, membership);
  });
  act(() => {
    room.testSendReaction(memberEventBob, reactionB, membership);
  });
  const [reactionElementA, reactionElementB] = getAllByRole("presentation");
  expect(reactionElementA.innerHTML).toEqual(reactionA.emoji);
  expect(reactionElementB.innerHTML).toEqual(reactionB.emoji);
});

test("hides reactions when reaction animations are disabled", () => {
  showReactions.setValue(false);
  const reaction = ReactionSet[0];
  const room = new MockRoom(memberUserIdAlice);
  const rtcSession = new MockRTCSession(room, membership);
  act(() => {
    room.testSendReaction(memberEventAlice, reaction, membership);
  });
  const { container } = render(<TestComponent rtcSession={rtcSession} />);
  expect(container.getElementsByTagName("span")).toHaveLength(0);
});

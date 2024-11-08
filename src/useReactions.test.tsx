/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { render } from "@testing-library/react";
import { act, FC } from "react";
import { describe, expect, test } from "vitest";
import { RoomEvent } from "matrix-js-sdk/src/matrix";

import { useReactions } from "./useReactions";
import {
  createHandRaisedReaction,
  createRedaction,
  MockRoom,
  MockRTCSession,
  TestReactionsWrapper,
} from "./utils/testReactions";

const memberUserIdAlice = "@alice:example.org";
const memberEventAlice = "$membership-alice:example.org";
const memberUserIdBob = "@bob:example.org";
const memberEventBob = "$membership-bob:example.org";

const membership: Record<string, string> = {
  [memberEventAlice]: memberUserIdAlice,
  [memberEventBob]: memberUserIdBob,
  "$membership-charlie:example.org": "@charlie:example.org",
};

/**
 * Test explanation.
 * This test suite checks that the useReactions hook appropriately reacts
 * to new reactions, redactions and membership changesin the room. There is
 * a large amount of test structure used to construct a mock environment.
 */

const TestComponent: FC = () => {
  const { raisedHands } = useReactions();
  return (
    <div>
      <ul>
        {Object.entries(raisedHands).map(([userId, date]) => (
          <li key={userId}>
            <span>{userId}</span>
            <time>{date.getTime()}</time>
          </li>
        ))}
      </ul>
    </div>
  );
};

describe("useReactions", () => {
  test("starts with an empty list", () => {
    const rtcSession = new MockRTCSession(
      new MockRoom(memberUserIdAlice),
      membership,
    );
    const { queryByRole } = render(
      <TestReactionsWrapper rtcSession={rtcSession}>
        <TestComponent />
      </TestReactionsWrapper>,
    );
    expect(queryByRole("list")?.children).to.have.lengthOf(0);
  });
  test("handles incoming raised hand", async () => {
    const room = new MockRoom(memberUserIdAlice);
    const rtcSession = new MockRTCSession(room, membership);
    const { queryByRole } = render(
      <TestReactionsWrapper rtcSession={rtcSession}>
        <TestComponent />
      </TestReactionsWrapper>,
    );
    await act(() => room.testSendHandRaise(memberEventAlice, membership));
    expect(queryByRole("list")?.children).to.have.lengthOf(1);
    await act(() => room.testSendHandRaise(memberEventBob, membership));
    expect(queryByRole("list")?.children).to.have.lengthOf(2);
  });
  test("handles incoming unraised hand", async () => {
    const room = new MockRoom(memberUserIdAlice);
    const rtcSession = new MockRTCSession(room, membership);
    const { queryByRole } = render(
      <TestReactionsWrapper rtcSession={rtcSession}>
        <TestComponent />
      </TestReactionsWrapper>,
    );
    const reactionEventId = await act(() =>
      room.testSendHandRaise(memberEventAlice, membership),
    );
    expect(queryByRole("list")?.children).to.have.lengthOf(1);
    await act(() =>
      room.emit(
        RoomEvent.Redaction,
        createRedaction(memberUserIdAlice, reactionEventId),
        room,
        undefined,
      ),
    );
    expect(queryByRole("list")?.children).to.have.lengthOf(0);
  });
  test("handles loading prior raised hand events", () => {
    const room = new MockRoom(memberUserIdAlice, [
      createHandRaisedReaction(memberEventAlice, membership),
    ]);
    const rtcSession = new MockRTCSession(room, membership);
    const { queryByRole } = render(
      <TestReactionsWrapper rtcSession={rtcSession}>
        <TestComponent />
      </TestReactionsWrapper>,
    );
    expect(queryByRole("list")?.children).to.have.lengthOf(1);
  });
  // If the membership event changes for a user, we want to remove
  // the raised hand event.
  test("will remove reaction when a member leaves the call", () => {
    const room = new MockRoom(memberUserIdAlice, [
      createHandRaisedReaction(memberEventAlice, membership),
    ]);
    const rtcSession = new MockRTCSession(room, membership);
    const { queryByRole } = render(
      <TestReactionsWrapper rtcSession={rtcSession}>
        <TestComponent />
      </TestReactionsWrapper>,
    );
    expect(queryByRole("list")?.children).to.have.lengthOf(1);
    act(() => rtcSession.testRemoveMember(memberUserIdAlice));
    expect(queryByRole("list")?.children).to.have.lengthOf(0);
  });
  test("will remove reaction when a member joins via a new event", () => {
    const room = new MockRoom(memberUserIdAlice, [
      createHandRaisedReaction(memberEventAlice, membership),
    ]);
    const rtcSession = new MockRTCSession(room, membership);
    const { queryByRole } = render(
      <TestReactionsWrapper rtcSession={rtcSession}>
        <TestComponent />
      </TestReactionsWrapper>,
    );
    expect(queryByRole("list")?.children).to.have.lengthOf(1);
    // Simulate leaving and rejoining
    act(() => {
      rtcSession.testRemoveMember(memberUserIdAlice);
      rtcSession.testAddMember(memberUserIdAlice);
    });
    expect(queryByRole("list")?.children).to.have.lengthOf(0);
  });
  test("ignores invalid sender for historic event", () => {
    const room = new MockRoom(memberUserIdAlice, [
      createHandRaisedReaction(memberEventAlice, memberUserIdBob),
    ]);
    const rtcSession = new MockRTCSession(room, membership);
    const { queryByRole } = render(
      <TestReactionsWrapper rtcSession={rtcSession}>
        <TestComponent />
      </TestReactionsWrapper>,
    );
    expect(queryByRole("list")?.children).to.have.lengthOf(0);
  });
  test("ignores invalid sender for new event", async () => {
    const room = new MockRoom(memberUserIdAlice);
    const rtcSession = new MockRTCSession(room, membership);
    const { queryByRole } = render(
      <TestReactionsWrapper rtcSession={rtcSession}>
        <TestComponent />
      </TestReactionsWrapper>,
    );
    await act(() => room.testSendHandRaise(memberEventAlice, memberUserIdBob));
    expect(queryByRole("list")?.children).to.have.lengthOf(0);
  });
});

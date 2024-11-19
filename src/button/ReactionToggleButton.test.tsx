/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { MatrixRTCSession } from "matrix-js-sdk/src/matrixrtc";
import { TooltipProvider } from "@vector-im/compound-web";
import { userEvent } from "@testing-library/user-event";
import { ReactNode } from "react";

import {
  MockRoom,
  MockRTCSession,
  TestReactionsWrapper,
} from "../utils/testReactions";
import { ReactionToggleButton } from "./ReactionToggleButton";
import { ElementCallReactionEventType } from "../reactions";

const memberUserIdAlice = "@alice:example.org";
const memberEventAlice = "$membership-alice:example.org";

const membership: Record<string, string> = {
  [memberEventAlice]: memberUserIdAlice,
};

function TestComponent({
  rtcSession,
  room,
}: {
  rtcSession: MockRTCSession;
  room: MockRoom;
}): ReactNode {
  return (
    <TooltipProvider>
      <TestReactionsWrapper rtcSession={rtcSession}>
        <ReactionToggleButton
          rtcSession={rtcSession as unknown as MatrixRTCSession}
          client={room.client}
        />
      </TestReactionsWrapper>
    </TooltipProvider>
  );
}

test("Can open menu", async () => {
  const user = userEvent.setup();
  const room = new MockRoom(memberUserIdAlice);
  const rtcSession = new MockRTCSession(room, membership);
  const { getByLabelText, container } = render(
    <TestComponent rtcSession={rtcSession} room={room} />,
  );
  await user.click(getByLabelText("common.reactions"));
  expect(container).toMatchSnapshot();
});

test("Can raise hand", async () => {
  const user = userEvent.setup();
  const room = new MockRoom(memberUserIdAlice);
  const rtcSession = new MockRTCSession(room, membership);
  const { getByLabelText, container } = render(
    <TestComponent rtcSession={rtcSession} room={room} />,
  );
  await user.click(getByLabelText("common.reactions"));
  await user.click(getByLabelText("action.raise_hand"));
  expect(room.testSentEvents).toEqual([
    [
      undefined,
      "m.reaction",
      {
        "m.relates_to": {
          event_id: memberEventAlice,
          key: "🖐️",
          rel_type: "m.annotation",
        },
      },
    ],
  ]);
  expect(container).toMatchSnapshot();
});

test("Can lower hand", async () => {
  const user = userEvent.setup();
  const room = new MockRoom(memberUserIdAlice);
  const rtcSession = new MockRTCSession(room, membership);
  const { getByLabelText, container } = render(
    <TestComponent rtcSession={rtcSession} room={room} />,
  );
  const reactionEvent = room.testSendHandRaise(memberEventAlice, membership);
  await user.click(getByLabelText("common.reactions"));
  await user.click(getByLabelText("action.lower_hand"));
  expect(room.testRedactedEvents).toEqual([[undefined, reactionEvent]]);
  expect(container).toMatchSnapshot();
});

test("Can react with emoji", async () => {
  const user = userEvent.setup();
  const room = new MockRoom(memberUserIdAlice);
  const rtcSession = new MockRTCSession(room, membership);
  const { getByLabelText, getByText } = render(
    <TestComponent rtcSession={rtcSession} room={room} />,
  );
  await user.click(getByLabelText("common.reactions"));
  await user.click(getByText("🐶"));
  expect(room.testSentEvents).toEqual([
    [
      undefined,
      ElementCallReactionEventType,
      {
        "m.relates_to": {
          event_id: memberEventAlice,
          rel_type: "m.reference",
        },
        name: "dog",
        emoji: "🐶",
      },
    ],
  ]);
});

test("Can fully expand emoji picker", async () => {
  const user = userEvent.setup();
  const room = new MockRoom(memberUserIdAlice);
  const rtcSession = new MockRTCSession(room, membership);
  const { getByText, container, getByLabelText } = render(
    <TestComponent rtcSession={rtcSession} room={room} />,
  );
  await user.click(getByLabelText("common.reactions"));
  await user.click(getByLabelText("action.show_more"));
  expect(container).toMatchSnapshot();
  await user.click(getByText("🦗"));

  expect(room.testSentEvents).toEqual([
    [
      undefined,
      ElementCallReactionEventType,
      {
        "m.relates_to": {
          event_id: memberEventAlice,
          rel_type: "m.reference",
        },
        name: "crickets",
        emoji: "🦗",
      },
    ],
  ]);
});

test("Can close search", async () => {
  const user = userEvent.setup();
  const room = new MockRoom(memberUserIdAlice);
  const rtcSession = new MockRTCSession(room, membership);
  const { getByLabelText, container } = render(
    <TestComponent rtcSession={rtcSession} room={room} />,
  );
  await user.click(getByLabelText("common.reactions"));
  await user.click(getByLabelText("action.show_more"));
  await user.click(getByLabelText("action.show_less"));
  expect(container).toMatchSnapshot();
});

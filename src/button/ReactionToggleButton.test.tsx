/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { act, render } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { TooltipProvider } from "@vector-im/compound-web";
import { userEvent } from "@testing-library/user-event";
import { type ReactNode } from "react";

import { ReactionToggleButton } from "./ReactionToggleButton";
import { ElementCallReactionEventType } from "../reactions";
import { type CallViewModel } from "../state/CallViewModel/CallViewModel";
import { getBasicCallViewModelEnvironment } from "../utils/test-viewmodel";
import { alice, local, localRtcMember } from "../utils/test-fixtures";
import { type MockRTCSession } from "../utils/test";
import { ReactionsSenderProvider } from "../reactions/useReactionsSender";

vi.mock("livekit-client/e2ee-worker?worker");

const localIdent = `${localRtcMember.userId}:${localRtcMember.deviceId}`;

function TestComponent({
  rtcSession,
  vm,
}: {
  rtcSession: MockRTCSession;
  vm: CallViewModel;
}): ReactNode {
  return (
    <TooltipProvider>
      <ReactionsSenderProvider
        vm={vm}
        rtcSession={rtcSession.asMockedSession()}
      >
        <ReactionToggleButton vm={vm} identifier={localIdent} />
      </ReactionsSenderProvider>
    </TooltipProvider>
  );
}

test("Can open menu", async () => {
  const user = userEvent.setup();
  const { vm, rtcSession } = getBasicCallViewModelEnvironment([alice]);
  const { getByLabelText, container } = render(
    <TestComponent vm={vm} rtcSession={rtcSession} />,
  );
  await user.click(getByLabelText("Reactions"));
  expect(container).toMatchSnapshot();
});

test("Can raise hand", async () => {
  const user = userEvent.setup();
  const { vm, rtcSession, handRaisedSubject$ } =
    getBasicCallViewModelEnvironment([local, alice]);
  const { getByLabelText, container } = render(
    <TestComponent vm={vm} rtcSession={rtcSession} />,
  );
  await user.click(getByLabelText("Reactions"));
  await user.click(getByLabelText("Raise hand"));
  expect(rtcSession.room.client.sendEvent).toHaveBeenCalledWith(
    rtcSession.room.roomId,
    "m.reaction",
    {
      "m.relates_to": {
        event_id: localRtcMember.eventId,
        key: "🖐️",
        rel_type: "m.annotation",
      },
    },
  );
  act(() => {
    // Mock receiving a reaction.
    handRaisedSubject$.next({
      [localIdent]: {
        time: new Date(),
        reactionEventId: "",
        membershipEventId: localRtcMember.eventId!,
      },
    });
  });
  expect(container).toMatchSnapshot();
});

test("Can lower hand", async () => {
  const reactionEventId = "$my-reaction-event:example.org";
  const user = userEvent.setup();
  const { vm, rtcSession, handRaisedSubject$ } =
    getBasicCallViewModelEnvironment([local, alice]);
  const { getByLabelText, container } = render(
    <TestComponent vm={vm} rtcSession={rtcSession} />,
  );
  await user.click(getByLabelText("Reactions"));
  await user.click(getByLabelText("Raise hand"));
  act(() => {
    handRaisedSubject$.next({
      [localIdent]: {
        time: new Date(),
        reactionEventId,
        membershipEventId: localRtcMember.eventId!,
      },
    });
  });
  await user.click(getByLabelText("Reactions"));
  await user.click(getByLabelText("Lower hand"));
  expect(rtcSession.room.client.redactEvent).toHaveBeenCalledWith(
    rtcSession.room.roomId,
    reactionEventId,
  );
  act(() => {
    // Mock receiving a redacted reaction.
    handRaisedSubject$.next({});
  });
  expect(container).toMatchSnapshot();
});

test("Can react with emoji", async () => {
  const user = userEvent.setup();
  const { vm, rtcSession } = getBasicCallViewModelEnvironment([local, alice]);
  const { getByLabelText, getByText } = render(
    <TestComponent vm={vm} rtcSession={rtcSession} />,
  );
  await user.click(getByLabelText("Reactions"));
  await user.click(getByText("🐶"));
  expect(rtcSession.room.client.sendEvent).toHaveBeenCalledWith(
    rtcSession.room.roomId,
    ElementCallReactionEventType,
    {
      "m.relates_to": {
        event_id: localRtcMember.eventId,
        rel_type: "m.reference",
      },
      name: "dog",
      emoji: "🐶",
    },
  );
});

test("Can fully expand emoji picker", async () => {
  const user = userEvent.setup();
  const { vm, rtcSession } = getBasicCallViewModelEnvironment([local, alice]);
  const { getByLabelText, container, getByText } = render(
    <TestComponent vm={vm} rtcSession={rtcSession} />,
  );
  await user.click(getByLabelText("Reactions"));
  await user.click(getByLabelText("Show more"));
  expect(container).toMatchSnapshot();
  await user.click(getByText("🦗"));
  expect(rtcSession.room.client.sendEvent).toHaveBeenCalledWith(
    rtcSession.room.roomId,
    ElementCallReactionEventType,
    {
      "m.relates_to": {
        event_id: localRtcMember.eventId,
        rel_type: "m.reference",
      },
      name: "crickets",
      emoji: "🦗",
    },
  );
});

test("Can close reaction dialog", async () => {
  const user = userEvent.setup();
  const { vm, rtcSession } = getBasicCallViewModelEnvironment([local, alice]);
  const { getByLabelText, container } = render(
    <TestComponent vm={vm} rtcSession={rtcSession} />,
  );
  await user.click(getByLabelText("Reactions"));
  await user.click(getByLabelText("Show more"));
  await user.click(getByLabelText("Show less"));
  expect(container).toMatchSnapshot();
});

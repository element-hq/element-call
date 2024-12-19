/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { act, render } from "@testing-library/react";
import { expect, test } from "vitest";
import { TooltipProvider } from "@vector-im/compound-web";
import { userEvent } from "@testing-library/user-event";
import { type ReactNode } from "react";
import { type MatrixRTCSession } from "matrix-js-sdk/src/matrixrtc/MatrixRTCSession";

import { ReactionToggleButton } from "./ReactionToggleButton";
import { ElementCallReactionEventType } from "../reactions";
import { type CallViewModel } from "../state/CallViewModel";
import { getBasicCallViewModelEnvironment } from "../utils/test-viewmodel";
import { alice, local, localRtcMember } from "../utils/test-fixtures";
import { type MockRTCSession } from "../utils/test";
import { ReactionsSenderProvider } from "../reactions/useReactionsSender";

const localIdent = `${localRtcMember.sender}:${localRtcMember.deviceId}`;

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
        rtcSession={rtcSession as unknown as MatrixRTCSession}
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
  await user.click(getByLabelText("common.reactions"));
  expect(container).toMatchSnapshot();
});

test("Can raise hand", async () => {
  const user = userEvent.setup();
  const { vm, rtcSession, handRaisedSubject$ } =
    getBasicCallViewModelEnvironment([local, alice]);
  const { getByLabelText, container } = render(
    <TestComponent vm={vm} rtcSession={rtcSession} />,
  );
  await user.click(getByLabelText("common.reactions"));
  await user.click(getByLabelText("action.raise_hand"));
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
  await user.click(getByLabelText("common.reactions"));
  await user.click(getByLabelText("action.raise_hand"));
  act(() => {
    handRaisedSubject$.next({
      [localIdent]: {
        time: new Date(),
        reactionEventId,
        membershipEventId: localRtcMember.eventId!,
      },
    });
  });
  await user.click(getByLabelText("common.reactions"));
  await user.click(getByLabelText("action.lower_hand"));
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
  await user.click(getByLabelText("common.reactions"));
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
  await user.click(getByLabelText("common.reactions"));
  await user.click(getByLabelText("action.show_more"));
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
  await user.click(getByLabelText("common.reactions"));
  await user.click(getByLabelText("action.show_more"));
  await user.click(getByLabelText("action.show_less"));
  expect(container).toMatchSnapshot();
});

/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { act, render } from "@testing-library/react";
import { expect, test } from "vitest";
import { TooltipProvider } from "@vector-im/compound-web";
import { userEvent } from "@testing-library/user-event";
import { type ReactNode } from "react";
import { type MatrixClient, type Room } from "matrix-js-sdk";

import { ReactionToggleButton } from "./ReactionToggleButton";
import { ElementCallReactionEventType } from "../reactions";
import { type CallViewModel } from "../state/CallViewModel/CallViewModel";
import { getBasicCallViewModelEnvironment } from "../utils/test-viewmodel";
import { alice, local, localRtcMember } from "../utils/test-fixtures";
import { ReactionsSenderProvider } from "../reactions/useReactionsSender";
import { initializeWidget } from "../widget";
initializeWidget();

const localIdent = `${localRtcMember.userId}:${localRtcMember.deviceId}`;

function TestComponent({
  matrixRoom,
  client,
  vm,
}: {
  matrixRoom: Room;
  client: MatrixClient;
  vm: CallViewModel;
}): ReactNode {
  return (
    <TooltipProvider>
      <ReactionsSenderProvider vm={vm} room={matrixRoom} client={client}>
        <ReactionToggleButton
          reactionData={{
            reactions$: vm.reactions$,
            handsRaised$: vm.handsRaised$,
          }}
          identifier={localIdent}
        />
      </ReactionsSenderProvider>
    </TooltipProvider>
  );
}

test("Can open menu", async () => {
  const user = userEvent.setup();
  const { vm, matrixRoom, client } = getBasicCallViewModelEnvironment([alice]);
  const { getByLabelText, container } = render(
    <TestComponent vm={vm} matrixRoom={matrixRoom} client={client} />,
  );
  await user.click(getByLabelText("Reactions"));
  expect(container).toMatchSnapshot();
});

test("Can raise hand", async () => {
  const user = userEvent.setup();
  const { vm, matrixRoom, client, handRaisedSubject$ } =
    getBasicCallViewModelEnvironment([local, alice]);
  const { getByLabelText, container } = render(
    <TestComponent vm={vm} matrixRoom={matrixRoom} client={client} />,
  );
  await user.click(getByLabelText("Reactions"));
  await user.click(getByLabelText("Raise hand"));
  expect(client.sendEvent).toHaveBeenCalledWith(
    matrixRoom.roomId,
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
  const { vm, matrixRoom, client, handRaisedSubject$ } =
    getBasicCallViewModelEnvironment([local, alice]);
  const { getByLabelText, container } = render(
    <TestComponent vm={vm} matrixRoom={matrixRoom} client={client} />,
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
  expect(client.redactEvent).toHaveBeenCalledWith(
    matrixRoom.roomId,
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
  const { vm, matrixRoom, client } = getBasicCallViewModelEnvironment([
    local,
    alice,
  ]);
  const { getByLabelText, getByText } = render(
    <TestComponent vm={vm} matrixRoom={matrixRoom} client={client} />,
  );
  await user.click(getByLabelText("Reactions"));
  await user.click(getByText("🐶"));
  expect(client.sendEvent).toHaveBeenCalledWith(
    matrixRoom.roomId,
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
  const { vm, matrixRoom, client } = getBasicCallViewModelEnvironment([
    local,
    alice,
  ]);
  const { getByLabelText, container, getByText } = render(
    <TestComponent vm={vm} matrixRoom={matrixRoom} client={client} />,
  );
  await user.click(getByLabelText("Reactions"));
  await user.click(getByLabelText("Show more"));
  expect(container).toMatchSnapshot();
  await user.click(getByText("🦗"));
  expect(client.sendEvent).toHaveBeenCalledWith(
    matrixRoom.roomId,
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
  const { vm, matrixRoom, client } = getBasicCallViewModelEnvironment([
    local,
    alice,
  ]);
  const { getByLabelText, container } = render(
    <TestComponent vm={vm} matrixRoom={matrixRoom} client={client} />,
  );
  await user.click(getByLabelText("Reactions"));
  await user.click(getByLabelText("Show more"));
  await user.click(getByLabelText("Show less"));
  expect(container).toMatchSnapshot();
});

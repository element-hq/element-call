/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { render } from "@testing-library/react";
import { expect, test, afterEach, vi } from "vitest";
import { act } from "react";

import { showReactions } from "../settings/settings";
import { ReactionsOverlay } from "./ReactionsOverlay";
import { ReactionSet } from "../reactions";
import {
  local,
  alice,
  aliceRtcMember,
  bobRtcMember,
} from "../utils/test-fixtures";
import { getBasicCallViewModelEnvironment } from "../utils/test-viewmodel";

vi.mock("livekit-client/e2ee-worker?worker");

afterEach(() => {
  showReactions.setValue(showReactions.defaultValue);
});

test("defaults to showing no reactions", () => {
  showReactions.setValue(true);
  const { vm } = getBasicCallViewModelEnvironment([local, alice]);
  const { container } = render(<ReactionsOverlay vm={vm} />);
  expect(container.getElementsByTagName("span")).toHaveLength(0);
});

test("shows a reaction when sent", () => {
  showReactions.setValue(true);
  const { vm, reactionsSubject$ } = getBasicCallViewModelEnvironment([
    local,
    alice,
  ]);
  const { getByRole } = render(<ReactionsOverlay vm={vm} />);
  const reaction = ReactionSet[0];
  act(() => {
    reactionsSubject$.next({
      [aliceRtcMember.deviceId]: {
        reactionOption: reaction,
        expireAfter: new Date(0),
      },
    });
  });
  const span = getByRole("presentation");
  expect(getByRole("presentation")).toBeTruthy();
  expect(span.innerHTML).toEqual(reaction.emoji);
});

test("shows two of the same reaction when sent", () => {
  showReactions.setValue(true);
  const reaction = ReactionSet[0];
  const { vm, reactionsSubject$ } = getBasicCallViewModelEnvironment([
    local,
    alice,
  ]);
  const { getAllByRole } = render(<ReactionsOverlay vm={vm} />);
  act(() => {
    reactionsSubject$.next({
      [aliceRtcMember.deviceId]: {
        reactionOption: reaction,
        expireAfter: new Date(0),
      },
      [bobRtcMember.deviceId]: {
        reactionOption: reaction,
        expireAfter: new Date(0),
      },
    });
  });
  expect(getAllByRole("presentation")).toHaveLength(2);
});

test("shows two different reactions when sent", () => {
  showReactions.setValue(true);
  const [reactionA, reactionB] = ReactionSet;
  const { vm, reactionsSubject$ } = getBasicCallViewModelEnvironment([
    local,
    alice,
  ]);
  const { getAllByRole } = render(<ReactionsOverlay vm={vm} />);
  act(() => {
    reactionsSubject$.next({
      [aliceRtcMember.deviceId]: {
        reactionOption: reactionA,
        expireAfter: new Date(0),
      },
      [bobRtcMember.deviceId]: {
        reactionOption: reactionB,
        expireAfter: new Date(0),
      },
    });
  });
  const [reactionElementA, reactionElementB] = getAllByRole("presentation");
  expect(reactionElementA.innerHTML).toEqual(reactionA.emoji);
  expect(reactionElementB.innerHTML).toEqual(reactionB.emoji);
});

test("hides reactions when reaction animations are disabled", () => {
  showReactions.setValue(false);
  const reaction = ReactionSet[0];
  const { vm, reactionsSubject$ } = getBasicCallViewModelEnvironment([
    local,
    alice,
  ]);
  const { container } = render(<ReactionsOverlay vm={vm} />);
  act(() => {
    reactionsSubject$.next({
      [aliceRtcMember.deviceId]: {
        reactionOption: reaction,
        expireAfter: new Date(0),
      },
    });
  });
  expect(container.getElementsByTagName("span")).toHaveLength(0);
});

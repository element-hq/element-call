/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { render } from "@testing-library/react";
import { type FC, useRef } from "react";
import { expect, test, vi } from "vitest";
import { Button } from "@vector-im/compound-web";
import userEvent from "@testing-library/user-event";

import { useCallViewKeyboardShortcuts } from "../src/useCallViewKeyboardShortcuts";
import {
  type ReactionOption,
  ReactionSet,
  ReactionsRowSize,
} from "./reactions";

// Test Explanation:
// - The main objective is to test `useCallViewKeyboardShortcuts`.
//   The TestComponent just wraps a button around that hook.

interface TestComponentProps {
  setAudioEnabled?: (enabled: boolean) => void;
  onButtonClick?: () => void;
  sendReaction?: () => void;
  toggleHandRaised?: () => void;
}

const TestComponent: FC<TestComponentProps> = ({
  setAudioEnabled = (): void => {},
  onButtonClick = (): void => {},
  sendReaction = (reaction: ReactionOption): void => {},
  toggleHandRaised = (): void => {},
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  useCallViewKeyboardShortcuts(
    ref,
    () => {},
    () => {},
    setAudioEnabled,
    sendReaction,
    toggleHandRaised,
  );
  return (
    <div ref={ref}>
      <Button onClick={onButtonClick}>TEST</Button>
    </div>
  );
};

test("spacebar unmutes", async () => {
  const user = userEvent.setup();
  let muted = true;
  render(
    <TestComponent
      onButtonClick={() => (muted = false)}
      setAudioEnabled={(m) => {
        muted = !m;
      }}
    />,
  );

  expect(muted).toBe(true);
  await user.keyboard("[Space>]");
  expect(muted).toBe(false);
  await user.keyboard("[/Space]");

  expect(muted).toBe(true);
});

test("spacebar prioritizes pressing a button", async () => {
  const user = userEvent.setup();

  const setAudioEnabled = vi.fn();
  const onClick = vi.fn();
  render(
    <TestComponent setAudioEnabled={setAudioEnabled} onButtonClick={onClick} />,
  );

  await user.tab(); // Focus the button
  await user.keyboard("[Space]");
  expect(setAudioEnabled).not.toBeCalled();
  expect(onClick).toBeCalled();
});

test("reactions can be sent via keyboard presses", async () => {
  const user = userEvent.setup();

  const sendReaction = vi.fn();
  render(<TestComponent sendReaction={sendReaction} />);

  for (let index = 1; index <= ReactionsRowSize; index++) {
    await user.keyboard(index.toString());
    expect(sendReaction).toHaveBeenNthCalledWith(index, ReactionSet[index - 1]);
  }
});

test("reaction is not sent when modifier key is held", async () => {
  const user = userEvent.setup();

  const sendReaction = vi.fn();
  render(<TestComponent sendReaction={sendReaction} />);

  await user.keyboard("{Meta>}1{/Meta}");
  expect(sendReaction).not.toHaveBeenCalled();
});

test("raised hand can be sent via keyboard presses", async () => {
  const user = userEvent.setup();

  const toggleHandRaised = vi.fn();
  render(<TestComponent toggleHandRaised={toggleHandRaised} />);
  await user.keyboard("h");

  expect(toggleHandRaised).toHaveBeenCalledOnce();
});

test("unmuting happens in place of the default action", async () => {
  const user = userEvent.setup();
  const defaultPrevented = vi.fn();
  // In the real application, we mostly just want the spacebar shortcut to avoid
  // scrolling the page. But to test that here in JSDOM, we need some kind of
  // container element that can be interactive and receive focus / keydown
  // events. <video> is kind of a weird choice, but it'll do the job.
  render(
    <video
      tabIndex={0}
      onKeyDown={(e) => defaultPrevented(e.isDefaultPrevented())}
    >
      <TestComponent setAudioEnabled={() => {}} />
    </video>,
  );

  await user.tab(); // Focus the <video>
  await user.keyboard("[Space]");
  expect(defaultPrevented).toBeCalledWith(true);
});

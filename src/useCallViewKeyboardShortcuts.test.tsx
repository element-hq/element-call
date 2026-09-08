/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { render } from "@testing-library/react";
import { type FC, useState } from "react";
import { expect, test, vi } from "vitest";
import { Button } from "@vector-im/compound-web";
import userEvent from "@testing-library/user-event";

import { useCallViewKeyboardShortcuts } from "../src/useCallViewKeyboardShortcuts";
import {
  type ReactionOption,
  ReactionSet,
  ReactionsRowSize,
} from "./reactions";
import { type Controls } from "./controls";
import { RootElementProvider } from "./RootElementContext";

// Test Explanation:
// - The main objective is to test `useCallViewKeyboardShortcuts`.
//   The TestComponent just wraps a button around that hook.

interface TestComponentProps {
  setAudioEnabled?: (enabled: boolean) => void;
  onButtonClick?: () => void;
  sendReaction?: () => void;
  toggleHandRaised?: () => void;
  initialModalOpen?: boolean;
}

const TestComponent: FC<TestComponentProps> = ({
  setAudioEnabled = (): void => {},
  onButtonClick = (): void => {},
  sendReaction = (reaction: ReactionOption): void => {},
  toggleHandRaised = (): void => {},
  initialModalOpen = false,
}) => {
  const [modalOpen, setModalOpen] = useState(initialModalOpen);
  useCallViewKeyboardShortcuts(
    () => {},
    () => {},
    setAudioEnabled,
    sendReaction,
    toggleHandRaised,
  );
  return (
    <>
      <div>
        <Button onClick={onButtonClick}>TEST</Button>
      </div>
      {/* A dialog, which is what claims key presses for itself; where it
      lives in the DOM does not matter */}
      {modalOpen && (
        <dialog
          open
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setModalOpen(false);
            }
          }}
        >
          <button>InModalButton</button>
        </dialog>
      )}
    </>
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

test("raised hand cannot be sent via keyboard presses if modal open and focussed", async () => {
  const user = userEvent.setup();
  const toggleHandRaised = vi.fn();
  const { getByRole } = render(
    <TestComponent
      toggleHandRaised={toggleHandRaised}
      initialModalOpen={true}
    />,
  );
  getByRole("button", { name: "InModalButton" }).focus();
  await user.keyboard("h");

  expect(toggleHandRaised).not.toHaveBeenCalledOnce();

  // once we press esc...
  await user.keyboard("[Escape]");
  // we can toggle the hand raise...
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
    <div>
      <video
        tabIndex={0}
        onKeyDown={(e) => defaultPrevented(e.isDefaultPrevented())}
      />
      <TestComponent setAudioEnabled={() => {}} />,
    </div>,
  );

  await user.tab(); // Focus the <video>
  await user.keyboard("[Space]");
  expect(defaultPrevented).toBeCalledWith(true);
});

test("escape button triggers the controls back action", async () => {
  const user = userEvent.setup();

  window.controls = { onBackButtonPressed: vi.fn() } as unknown as Controls;
  // In the real application, we mostly just want the spacebar shortcut to avoid
  // scrolling the page. But to test that here in JSDOM, we need some kind of
  // container element that can be interactive and receive focus / keydown
  // events. <video> is kind of a weird choice, but it'll do the job.
  render(<TestComponent setAudioEnabled={() => {}} />);

  await user.keyboard("[Escape]");
  expect(window.controls.onBackButtonPressed).toHaveBeenCalled();
});

test("escape button does not trigger back if sth else is focused", async () => {
  const user = userEvent.setup();

  window.controls = { onBackButtonPressed: vi.fn() } as unknown as Controls;

  const { getByRole } = render(<TestComponent initialModalOpen={true} />);
  getByRole("button", { name: "InModalButton" }).focus();

  // First Escape: the dialog's onKeyDown intercepts it and closes the modal.
  await user.keyboard("[Escape]");
  expect(window.controls.onBackButtonPressed).not.toHaveBeenCalled();

  // Second Escape: modal is gone, focus has fallen back to document.body,
  // which *does* contain the ref div, so the hook fires and back IS triggered.
  await user.keyboard("[Escape]");
  expect(window.controls.onBackButtonPressed).toHaveBeenCalled();
});

test("typing in a text field is not a shortcut", async () => {
  const user = userEvent.setup();
  const toggleHandRaised = vi.fn();
  const { getByRole } = render(
    <>
      <input type="text" aria-label="Name" />
      <TestComponent toggleHandRaised={toggleHandRaised} />
    </>,
  );

  getByRole("textbox", { name: "Name" }).focus();
  await user.keyboard("h");
  expect(toggleHandRaised).not.toHaveBeenCalled();
});

/**
 * Element Call embedded in a host's page: the root is a container, with the
 * rest of the page around it.
 */
const Embedded: FC<{ toggleHandRaised: () => void }> = ({
  toggleHandRaised,
}) => {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  return (
    <>
      <button>Host button</button>
      <div ref={setRoot} data-testid="root">
        {root !== null && (
          <RootElementProvider value={root}>
            <TestComponent toggleHandRaised={toggleHandRaised} />
          </RootElementProvider>
        )}
      </div>
    </>
  );
};

test("only hears keys pressed within its root element", async () => {
  const user = userEvent.setup();
  const toggleHandRaised = vi.fn();
  const { getByRole } = render(
    <Embedded toggleHandRaised={toggleHandRaised} />,
  );

  // Focus on the host's page: none of Element Call's business
  getByRole("button", { name: "Host button" }).focus();
  await user.keyboard("h");
  expect(toggleHandRaised).not.toHaveBeenCalled();

  // Focus inside the root: a shortcut
  getByRole("button", { name: "TEST" }).focus();
  await user.keyboard("h");
  expect(toggleHandRaised).toHaveBeenCalledOnce();
});

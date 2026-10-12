/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import userEvent from "@testing-library/user-event";

import { Modal } from "./Modal";
import { RootElementProvider } from "./RootElementContext";

const originalMatchMedia = window.matchMedia;
afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

test("that nothing is rendered when the modal is closed", () => {
  const { queryByRole } = render(
    <Modal title="My modal" open={false}>
      <p>This is the content.</p>
    </Modal>,
  );
  expect(queryByRole("dialog")).toBeNull();
});

test("the content is rendered when the modal is open", () => {
  const { queryByRole } = render(
    <Modal title="My modal" open={true}>
      <p>This is the content.</p>
    </Modal>,
  );
  expect(queryByRole("dialog")).toMatchSnapshot();
});

test("the modal can be closed by clicking the close button", async () => {
  function ModalFn(): ReactNode {
    const [isOpen, setOpen] = useState(true);
    return (
      <Modal title="My modal" open={isOpen} onDismiss={() => setOpen(false)}>
        <p>This is the content.</p>
      </Modal>
    );
  }
  const user = userEvent.setup();
  const { queryByRole, getByRole } = render(<ModalFn />);
  await user.click(getByRole("button", { name: "Close" }));
  expect(queryByRole("dialog")).toBeNull();
});

test("the modal renders as a drawer in mobile viewports", () => {
  window.matchMedia = function (query): MediaQueryList {
    return {
      matches: query.includes("hover: none"),
      addEventListener(): MediaQueryList {
        return this as MediaQueryList;
      },
      removeEventListener(): MediaQueryList {
        return this as MediaQueryList;
      },
    } as unknown as MediaQueryList;
  };

  const { queryByRole } = render(
    <Modal title="My modal" open={true}>
      <p>This is the content.</p>
    </Modal>,
  );
  expect(queryByRole("dialog")).toMatchSnapshot();
});

test("the modal can be closed by clicking the backdrop, in another window too", async () => {
  // A dialog moved into another window, as a host does for a Document
  // Picture-in-Picture window: its nodes are not `Node`s of this window
  const frame = document.createElement("iframe");
  document.body.appendChild(frame);
  const otherBody = frame.contentDocument!.body;

  function ModalFn(): ReactNode {
    const [isOpen, setOpen] = useState(true);
    return (
      <RootElementProvider value={otherBody}>
        <Modal title="My modal" open={isOpen} onDismiss={() => setOpen(false)}>
          <p>This is the content.</p>
        </Modal>
      </RootElementProvider>
    );
  }
  render(<ModalFn />);
  const dialog = otherBody.querySelector('[role="dialog"]');
  expect(dialog).not.toBeNull();
  const backdrop = dialog!.previousElementSibling as HTMLElement;

  const user = userEvent.setup({ document: frame.contentDocument! });
  await user.click(backdrop);
  expect(otherBody.querySelector('[role="dialog"]')).toBeNull();
  frame.remove();
});

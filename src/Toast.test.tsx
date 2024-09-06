/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test, vi } from "vitest";
import { render, configure } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Toast } from "../src/Toast";
import { withFakeTimers } from "./utils/test";

configure({
  defaultHidden: true,
});

// Test Explanation:
// This test the toast. We need to use { document: window.document } because the toast listens
// for user input on `window`.
describe("Toast", () => {
  test("renders", () => {
    const { queryByRole } = render(
      <Toast open={false} onDismiss={() => {}}>
        Hello world!
      </Toast>,
    );
    expect(queryByRole("dialog")).toBe(null);
    const { getByRole } = render(
      <Toast open={true} onDismiss={() => {}}>
        Hello world!
      </Toast>,
    );
    expect(getByRole("dialog")).toMatchSnapshot();
  });

  test("dismisses when Esc is pressed", async () => {
    const user = userEvent.setup({ document: window.document });
    const onDismiss = vi.fn();
    render(
      <Toast open={true} onDismiss={onDismiss}>
        Hello world!
      </Toast>,
    );
    await user.keyboard("[Escape]");
    expect(onDismiss).toHaveBeenCalled();
  });

  test("dismisses when background is clicked", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const { getByRole, unmount } = render(
      <Toast open={true} onDismiss={onDismiss}>
        Hello world!
      </Toast>,
    );
    const background = getByRole("dialog").previousSibling! as Element;
    await user.click(background);
    expect(onDismiss).toHaveBeenCalled();
    unmount();
  });

  test("dismisses itself after the specified timeout", () => {
    withFakeTimers(() => {
      const onDismiss = vi.fn();
      render(
        <Toast open={true} onDismiss={onDismiss} autoDismiss={2000}>
          Hello world!
        </Toast>,
      );
      vi.advanceTimersByTime(2000);
      expect(onDismiss).toHaveBeenCalled();
    });
  });
});

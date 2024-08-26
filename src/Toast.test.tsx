/*
Copyright 2023 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { describe, expect, test, vi } from "vitest";
import { render, configure } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Toast } from "../src/Toast";
import { withFakeTimers } from "./utils/test";

configure({
  defaultHidden: true,
});

describe("Toast", () => {
  test("renders", () => {
    const { queryByRole } = render(
      <Toast open={false} onDismiss={() => {}}>
        Hello world!
      </Toast>,
    );
    expect(queryByRole("dialog")).not.toBeInTheDocument();

    const { unmount, getByRole } = render(
      <Toast open={true} onDismiss={() => {}}>
        Hello world!
      </Toast>,
    );
    expect(getByRole("dialog")).toMatchSnapshot();
    unmount();
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

  test("dismisses when Esc is pressed", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const { debug } = render(
      <Toast open={true} onDismiss={onDismiss}>
        Hello world!
      </Toast>,
    );
    debug();
    await user.keyboard("[Escape]");
    expect(onDismiss).toHaveBeenCalled();
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

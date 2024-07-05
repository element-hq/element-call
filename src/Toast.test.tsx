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

import { expect, test, vi } from "vitest";
import { screen, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Toast } from "../src/Toast";
import { withFakeTimers } from "./utils/test";

test("Toast renders", () => {
  render(
    <Toast open={false} onDismiss={() => {}}>
      Hello world!
    </Toast>,
  );
  expect(screen.queryByRole("dialog")).toBe(null);
  render(
    <Toast open={true} onDismiss={() => {}}>
      Hello world!
    </Toast>,
  );
  expect(screen.getByRole("dialog")).toMatchSnapshot();
});

test("Toast dismisses when clicked", async () => {
  const onDismiss = vi.fn();
  render(
    <Toast open={true} onDismiss={onDismiss}>
      Hello world!
    </Toast>,
  );
  await userEvent.click(screen.getByRole("dialog"));
  expect(onDismiss).toHaveBeenCalled();
});

test("Toast dismisses itself after the specified timeout", async () => {
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

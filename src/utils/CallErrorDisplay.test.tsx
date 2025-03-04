/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { type ReactNode, useEffect } from "react";
import { BrowserRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { captureException } from "@sentry/react";

import { CallErrorDisplay } from "./CallErrorDisplay.tsx";
import {
  CallErrorStateProvider,
  useCallErrorDisplay,
} from "./useCallErrorDisplay.tsx";
import {
  ConnectionLostError,
  E2EENotSupportedError,
  ElementCallError,
  ErrorCategory,
  ErrorCode,
  MatrixRTCFocusMissingError,
} from "./errors.ts";

test("should expect to be wrapped in a CallErrorStateProvider", () => {
  expect(() => render(<CallErrorDisplay />)).toThrow(
    "useCallErrorDisplay must be used within an CallErrorStateProvider",
  );

  render(
    <CallErrorStateProvider>
      <CallErrorDisplay />
    </CallErrorStateProvider>,
  );
});

test.each([
  {
    error: new MatrixRTCFocusMissingError("example.com"),
    expectedTitle: "Call is not supported",
  },
  { error: new ConnectionLostError(), expectedTitle: "Connection lost" },
  { error: new E2EENotSupportedError(), expectedTitle: "Incompatible browser" },
])(
  "should report correct error for $expectedTitle",
  async ({ error, expectedTitle }) => {
    const TestComponent = (): ReactNode => {
      const { setCallErrorState } = useCallErrorDisplay();
      useEffect(() => {
        setCallErrorState({
          cause: error,
        });
      }, [setCallErrorState]);
      return <div>Hello</div>;
    };

    const { asFragment } = render(
      <BrowserRouter>
        <CallErrorStateProvider>
          <CallErrorDisplay />
          <TestComponent />
        </CallErrorStateProvider>
      </BrowserRouter>,
    );

    await screen.findByText(expectedTitle);

    expect(asFragment()).toMatchSnapshot();
  },
);

test("should render the error page", async () => {
  const TestComponent = (): ReactNode => {
    const { setCallErrorState } = useCallErrorDisplay();
    useEffect(() => {
      setCallErrorState({
        cause: new MatrixRTCFocusMissingError("example.com"),
      });
    }, [setCallErrorState]);
    return <div>Hello</div>;
  };

  const { asFragment } = render(
    <BrowserRouter>
      <CallErrorStateProvider>
        <CallErrorDisplay />
        <TestComponent />
      </CallErrorStateProvider>
    </BrowserRouter>,
  );

  await screen.findByText("Call is not supported");
  expect(screen.getByText(/Domain: example.com/i)).toBeInTheDocument();
  expect(
    screen.getByText(/Error Code: MISSING_MATRIX_RTC_FOCUS/i),
  ).toBeInTheDocument();

  await screen.findByRole("button", "Return to home screen");

  expect(asFragment()).toMatchSnapshot();
});

test("should render the actions", async () => {
  const user = userEvent.setup();

  const callback1 = vi.fn();
  const callback2 = vi.fn();

  const TestComponent = (): ReactNode => {
    const { setCallErrorState } = useCallErrorDisplay();
    useEffect(() => {
      setCallErrorState({
        cause: new MatrixRTCFocusMissingError("example.com"),
        actions: [
          { labelKey: "action_key1", onClick: callback1 },
          { labelKey: "action_key2", onClick: callback2 },
        ],
      });
    }, [setCallErrorState]);
    return <div>Hello</div>;
  };

  const { asFragment } = render(
    <BrowserRouter>
      <CallErrorStateProvider>
        <CallErrorDisplay />
        <TestComponent />
      </CallErrorStateProvider>
    </BrowserRouter>,
  );

  await screen.findByText("Call is not supported");
  await screen.findByRole("button", { name: "action_key1" });
  await screen.findByRole("button", { name: "action_key2" });
  await screen.findByRole("button", { name: "Return to home screen" });

  expect(asFragment()).toMatchSnapshot();

  await user.click(screen.getByRole("button", { name: "action_key2" }));

  expect(callback2).toHaveBeenCalledOnce();
  expect(callback1).not.toHaveBeenCalled();

  // should have reset the error
  expect(screen.queryByText("Call is not supported")).not.toBeInTheDocument();
});

test("should report to sentry on error", async () => {
  vi.mock("@sentry/react", { spy: true });

  const error = new ElementCallError(
    "FOO",
    ErrorCode.UNKNOWN_ERROR,
    ErrorCategory.UNKNOWN,
  );
  // const sentrySpy = vi.spyOn(Sentry, "captureException");
  const TestComponent = (): ReactNode => {
    const { setCallErrorState } = useCallErrorDisplay();
    useEffect(() => {
      setCallErrorState({
        cause: error,
      });
    }, [setCallErrorState]);
    return <div>Hello</div>;
  };

  render(
    <BrowserRouter>
      <CallErrorStateProvider>
        <CallErrorDisplay />
        <TestComponent />
      </CallErrorStateProvider>
    </BrowserRouter>,
  );

  await screen.findByText("Something went wrong");

  expect(captureException).toHaveBeenCalledWith(error);
});

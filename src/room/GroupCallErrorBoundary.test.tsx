/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  type FC,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import { BrowserRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";

import { GroupCallErrorBoundary } from "./GroupCallErrorBoundary.tsx";
import {
  ConnectionLostError,
  E2EENotSupportedError,
  type ElementCallError,
  InsufficientCapacityError,
  MatrixRTCFocusMissingError,
  UnknownCallError,
} from "../utils/errors.ts";
import { mockConfig } from "../utils/test.ts";
import { useGroupCallErrorBoundary } from "./useCallErrorBoundary.ts";
import { GroupCallErrorBoundaryContextProvider } from "./GroupCallErrorBoundaryContextProvider.tsx";

test.each([
  {
    error: new MatrixRTCFocusMissingError("example.com"),
    expectedTitle: "Call is not supported",
  },
  {
    error: new ConnectionLostError(),
    expectedTitle: "Connection lost",
    expectedDescription: "You were disconnected from the call.",
  },
  {
    error: new E2EENotSupportedError(),
    expectedTitle: "Incompatible browser",
    expectedDescription:
      "Your web browser does not support encrypted calls. Supported browsers include Chrome, Safari, and Firefox 117+.",
  },
  {
    error: new InsufficientCapacityError(),
    expectedTitle: "Insufficient capacity",
    expectedDescription:
      "The server has reached its maximum capacity and you cannot join the call at this time. Try again later, or contact your server admin if the problem persists.",
  },
])(
  "should report correct error for $expectedTitle",
  async ({ error, expectedTitle, expectedDescription }) => {
    const TestComponent = (): ReactNode => {
      throw error;
    };

    const onErrorMock = vi.fn();
    const { asFragment } = render(
      <BrowserRouter>
        <GroupCallErrorBoundary onError={onErrorMock}>
          <TestComponent />
        </GroupCallErrorBoundary>
      </BrowserRouter>,
    );

    await screen.findByText(expectedTitle);
    if (expectedDescription) {
      expect(screen.queryByText(expectedDescription)).toBeInTheDocument();
    }
    expect(onErrorMock).toHaveBeenCalledWith(error);

    expect(asFragment()).toMatchSnapshot();
  },
);

test("should render the error page with link back to home", async () => {
  const error = new MatrixRTCFocusMissingError("example.com");
  const TestComponent = (): ReactNode => {
    throw error;
  };

  const onErrorMock = vi.fn();
  const { asFragment } = render(
    <BrowserRouter>
      <GroupCallErrorBoundary onError={onErrorMock}>
        <TestComponent />
      </GroupCallErrorBoundary>
    </BrowserRouter>,
  );

  await screen.findByText("Call is not supported");
  expect(screen.getByText(/Domain: example.com/i)).toBeInTheDocument();
  expect(
    screen.getByText(/Error Code: MISSING_MATRIX_RTC_FOCUS/i),
  ).toBeInTheDocument();

  await screen.findByRole("button", { name: "Return to home screen" });

  expect(onErrorMock).toHaveBeenCalledOnce();
  expect(onErrorMock).toHaveBeenCalledWith(error);

  expect(asFragment()).toMatchSnapshot();
});

test("should have a reconnect button for ConnectionLostError", async () => {
  const user = userEvent.setup();

  const reconnectCallback = vi.fn();

  const TestComponent = (): ReactNode => {
    throw new ConnectionLostError();
  };

  const { asFragment } = render(
    <BrowserRouter>
      <GroupCallErrorBoundary
        onError={vi.fn()}
        recoveryActionHandler={reconnectCallback}
      >
        <TestComponent />
      </GroupCallErrorBoundary>
    </BrowserRouter>,
  );

  await screen.findByText("Connection lost");
  await screen.findByRole("button", { name: "Reconnect" });
  await screen.findByRole("button", { name: "Return to home screen" });

  expect(asFragment()).toMatchSnapshot();

  await user.click(screen.getByRole("button", { name: "Reconnect" }));

  expect(reconnectCallback).toHaveBeenCalledOnce();
  expect(reconnectCallback).toHaveBeenCalledWith("reconnect");
});

test("Action handling should reset error state", async () => {
  const user = userEvent.setup();

  const TestComponent: FC<{ fail: boolean }> = ({ fail }): ReactNode => {
    if (fail) {
      throw new ConnectionLostError();
    }
    return <div>HELLO</div>;
  };

  const WrapComponent = (): ReactNode => {
    const [failState, setFailState] = useState(true);
    const reconnectCallback = useCallback(() => {
      setFailState(false);
    }, [setFailState]);

    return (
      <BrowserRouter>
        <GroupCallErrorBoundary recoveryActionHandler={reconnectCallback}>
          <TestComponent fail={failState} />
        </GroupCallErrorBoundary>
      </BrowserRouter>
    );
  };

  render(<WrapComponent />);

  // Should fail first
  await screen.findByText("Connection lost");

  await user.click(screen.getByRole("button", { name: "Reconnect" }));

  // reconnect should have reset the error, thus rendering should be ok
  await screen.findByText("HELLO");
});

describe("Rageshake button", () => {
  function setupTest(testError: ElementCallError): void {
    mockConfig({
      rageshake: {
        submit_url: "https://rageshake.example.com.localhost",
      },
    });

    const TestComponent = (): ReactElement => {
      throw testError;
    };

    render(
      <BrowserRouter>
        <GroupCallErrorBoundary onError={vi.fn()}>
          <TestComponent />
        </GroupCallErrorBoundary>
      </BrowserRouter>,
    );
  }

  test("should show send rageshake button for unknown errors", () => {
    setupTest(new UnknownCallError(new Error("FOO")));

    expect(
      screen.queryByRole("button", { name: "Send debug logs" }),
    ).toBeInTheDocument();
  });

  test("should not show send rageshake button for call errors", () => {
    setupTest(new E2EENotSupportedError());

    expect(
      screen.queryByRole("button", { name: "Send debug logs" }),
    ).not.toBeInTheDocument();
  });
});

test("should show async error with useElementCallErrorContext", async () => {
  // const error = new MatrixRTCFocusMissingError("example.com");
  const TestComponent = (): ReactNode => {
    const { showGroupCallErrorBoundary } = useGroupCallErrorBoundary();
    useEffect(() => {
      setTimeout(() => {
        showGroupCallErrorBoundary(new ConnectionLostError());
      });
    }, [showGroupCallErrorBoundary]);

    return <div>Hello</div>;
  };

  const onErrorMock = vi.fn();
  render(
    <BrowserRouter>
      <GroupCallErrorBoundaryContextProvider>
        <GroupCallErrorBoundary onError={onErrorMock}>
          <TestComponent />
        </GroupCallErrorBoundary>
      </GroupCallErrorBoundaryContextProvider>
    </BrowserRouter>,
  );

  await screen.findByText("Connection lost");
});

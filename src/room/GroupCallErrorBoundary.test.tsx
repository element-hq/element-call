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
  useState,
} from "react";
import { BrowserRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";

import {
  type CallErrorRecoveryAction,
  GroupCallErrorBoundary,
} from "./GroupCallErrorBoundary.tsx";
import {
  ConnectionLostError,
  E2EENotSupportedError,
  type ElementCallError,
  InsufficientCapacityError,
  MatrixRTCTransportMissingError,
  UnknownCallError,
} from "../utils/errors.ts";
import { mockConfig } from "../utils/test.ts";
import { ElementWidgetActions, type WidgetHelpers } from "../widget.ts";

test.each([
  {
    error: new MatrixRTCTransportMissingError("example.com"),
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
        <GroupCallErrorBoundary
          onError={onErrorMock}
          recoveryActionHandler={vi.fn()}
          widget={null}
        >
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
  const error = new MatrixRTCTransportMissingError("example.com");
  const TestComponent = (): ReactNode => {
    throw error;
  };

  const onErrorMock = vi.fn();
  const { asFragment } = render(
    <BrowserRouter>
      <GroupCallErrorBoundary
        onError={onErrorMock}
        recoveryActionHandler={vi.fn()}
        widget={null}
      >
        <TestComponent />
      </GroupCallErrorBoundary>
    </BrowserRouter>,
  );

  await screen.findByText("Call is not supported");
  expect(screen.getByText(/Domain: example\.com/i)).toBeInTheDocument();
  expect(
    screen.getByText(/Error Code: MISSING_MATRIX_RTC_TRANSPORT/i),
  ).toBeInTheDocument();

  await screen.findByRole("button", { name: "Return to home screen" });

  expect(onErrorMock).toHaveBeenCalledOnce();
  expect(onErrorMock).toHaveBeenCalledWith(error);

  expect(asFragment()).toMatchSnapshot();
});

test("ConnectionLostError: Action handling should reset error state", async () => {
  const user = userEvent.setup();

  const TestComponent: FC<{ fail: boolean }> = ({ fail }): ReactNode => {
    if (fail) {
      throw new ConnectionLostError();
    }
    return <div>HELLO</div>;
  };

  const reconnectCallbackSpy = vi.fn();

  const WrapComponent = (): ReactNode => {
    const [failState, setFailState] = useState(true);
    const reconnectCallback = useCallback(
      async (action: CallErrorRecoveryAction) => {
        reconnectCallbackSpy(action);
        setFailState(false);
        return Promise.resolve();
      },
      [setFailState],
    );

    return (
      <BrowserRouter>
        <GroupCallErrorBoundary
          recoveryActionHandler={reconnectCallback}
          widget={null}
        >
          <TestComponent fail={failState} />
        </GroupCallErrorBoundary>
      </BrowserRouter>
    );
  };

  const { asFragment } = render(<WrapComponent />);

  // Should fail first
  await screen.findByText("Connection lost");
  await screen.findByRole("button", { name: "Reconnect" });
  await screen.findByRole("button", { name: "Return to home screen" });

  expect(asFragment()).toMatchSnapshot();

  await user.click(screen.getByRole("button", { name: "Reconnect" }));

  // reconnect should have reset the error, thus rendering should be ok
  await screen.findByText("HELLO");

  expect(reconnectCallbackSpy).toHaveBeenCalledOnce();
  expect(reconnectCallbackSpy).toHaveBeenCalledWith("reconnect");
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
        <GroupCallErrorBoundary
          onError={vi.fn()}
          recoveryActionHandler={vi.fn()}
          widget={null}
        >
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

test("should have a close button in widget mode", async () => {
  const error = new MatrixRTCTransportMissingError("example.com");
  const TestComponent = (): ReactNode => {
    throw error;
  };

  const mockWidget = {
    api: {
      transport: { send: vi.fn().mockResolvedValue(undefined), stop: vi.fn() },
    },
  } as unknown as WidgetHelpers;

  const user = userEvent.setup();
  const onErrorMock = vi.fn();
  const { asFragment } = render(
    <BrowserRouter>
      <GroupCallErrorBoundary
        widget={mockWidget}
        onError={onErrorMock}
        recoveryActionHandler={vi.fn()}
      >
        <TestComponent />
      </GroupCallErrorBoundary>
    </BrowserRouter>,
  );

  await screen.findByText("Call is not supported");

  await screen.findByRole("button", { name: "Close" });

  expect(asFragment()).toMatchSnapshot();

  await user.click(screen.getByRole("button", { name: "Close" }));

  expect(mockWidget.api.transport.send).toHaveBeenCalledWith(
    ElementWidgetActions.Close,
    expect.anything(),
  );
  expect(mockWidget.api.transport.stop).toHaveBeenCalled();
});

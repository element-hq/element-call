/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { type ReactElement, useCallback } from "react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";

import { GroupCallErrorBoundary } from "./room/GroupCallErrorBoundary";
import { useErrorBoundary } from "./useErrorBoundary";
import { ConnectionLostError } from "./utils/errors";

it("should show async error", async () => {
  const user = userEvent.setup();

  const TestComponent = (): ReactElement => {
    const { showErrorBoundary } = useErrorBoundary();

    const onClick = useCallback((): void => {
      showErrorBoundary(new ConnectionLostError());
    }, [showErrorBoundary]);

    return (
      <div>
        <h1>HELLO</h1>
        <button onClick={onClick}>Click me</button>
      </div>
    );
  };

  render(
    <BrowserRouter>
      <GroupCallErrorBoundary widget={null} recoveryActionHandler={vi.fn()}>
        <TestComponent />
      </GroupCallErrorBoundary>
    </BrowserRouter>,
  );

  await user.click(screen.getByRole("button", { name: "Click me" }));

  await screen.findByText("Connection lost");

  await user.click(screen.getByRole("button", { name: "Reconnect" }));

  await screen.findByText("HELLO");
});

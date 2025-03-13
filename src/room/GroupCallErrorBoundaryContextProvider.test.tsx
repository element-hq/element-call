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

import { GroupCallErrorBoundaryContextProvider } from "./GroupCallErrorBoundaryContextProvider.tsx";
import { GroupCallErrorBoundary } from "./GroupCallErrorBoundary.tsx";
import { useGroupCallErrorBoundary } from "./useCallErrorBoundary.ts";
import { ConnectionLostError } from "../utils/errors.ts";

it("should show async error", async () => {
  const user = userEvent.setup();

  const TestComponent = (): ReactElement => {
    const { showGroupCallErrorBoundary } = useGroupCallErrorBoundary();

    const onClick = useCallback((): void => {
      showGroupCallErrorBoundary(new ConnectionLostError());
    }, [showGroupCallErrorBoundary]);

    return (
      <div>
        <h1>HELLO</h1>
        <button onClick={onClick}>Click me</button>
      </div>
    );
  };

  render(
    <BrowserRouter>
      <GroupCallErrorBoundaryContextProvider>
        <GroupCallErrorBoundary widget={null} recoveryActionHandler={vi.fn()}>
          <TestComponent />
        </GroupCallErrorBoundary>
      </GroupCallErrorBoundaryContextProvider>
    </BrowserRouter>,
  );

  await user.click(screen.getByRole("button", { name: "Click me" }));

  await screen.findByText("Connection lost");

  await user.click(screen.getByRole("button", { name: "Reconnect" }));

  await screen.findByText("HELLO");
});

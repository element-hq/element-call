/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { type Room } from "matrix-js-sdk";
import { axe } from "vitest-axe";
import { BrowserRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";

import { InviteModal } from "./InviteModal";

// Used by copy-to-clipboard
window.prompt = (): null => null;

test("InviteModal is accessible", async () => {
  const user = userEvent.setup();
  const room = {
    roomId: "!a:example.org",
    name: "Mission Control",
  } as unknown as Room;
  const onDismiss = vi.fn();
  const { container } = render(
    <InviteModal room={room} open={true} onDismiss={onDismiss} />,
    { wrapper: BrowserRouter },
  );

  expect(await axe(container)).toHaveNoViolations();
  await user.click(screen.getByRole("button", { name: "Copy link" }));
  expect(onDismiss).toBeCalled();
});

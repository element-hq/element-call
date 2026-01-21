/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { render } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { TooltipProvider } from "@vector-im/compound-web";
import { expect, test, vi } from "vitest";

import { EndCallMenuButton } from "./EndCallMenuButton";

test("Can open menu and leave call", async () => {
  const user = userEvent.setup();
  const onLeave = vi.fn();
  const onTerminate = vi.fn();

  const { getByLabelText, getByRole, queryByRole } = render(
    <TooltipProvider>
      <EndCallMenuButton
        onLeave={onLeave}
        onTerminate={onTerminate}
        participantCount={1}
      />
    </TooltipProvider>,
  );

  await user.click(getByLabelText("End call"));
  await user.click(getByRole("menuitem", { name: "Leave call" }));

  expect(onLeave).toHaveBeenCalledTimes(1);
  expect(onTerminate).not.toHaveBeenCalled();
  expect(queryByRole("menuitem", { name: "End for everyone" })).toBeNull();
});

test("Terminate requires confirmation and keeps menu open", async () => {
  const user = userEvent.setup();
  const onLeave = vi.fn();
  const onTerminate = vi.fn();

  const { getByLabelText, getByRole } = render(
    <TooltipProvider>
      <EndCallMenuButton
        onLeave={onLeave}
        onTerminate={onTerminate}
        participantCount={2}
      />
    </TooltipProvider>,
  );

  await user.click(getByLabelText("End call"));

  await user.click(getByRole("menuitem", { name: "End for everyone" }));
  expect(onTerminate).not.toHaveBeenCalled();

  await user.click(getByRole("menuitem", { name: "End call for 2 people?" }));
  expect(onTerminate).toHaveBeenCalledTimes(1);
});


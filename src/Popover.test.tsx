/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "vitest";
import { axe } from "vitest-axe";
import { render, screen } from "@testing-library/react";

import { Popover } from "./Popover";

test("Popover renders", async () => {
  render(
    <Popover
      title="Example"
      trigger={<button>Open popover</button>}
      open
      onOpenChange={() => {}}
    >
      <p>This is an example of a popover.</p>
    </Popover>,
  );
  const button = screen.getByRole("button", { name: "Open popover" });
  const popover = screen.getByRole("dialog", { name: "Example" });
  expect(button).toMatchSnapshot("button");
  expect(popover).toMatchSnapshot("popover");
  expect(await axe(document.body)).toHaveNoViolations();
});

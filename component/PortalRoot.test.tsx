/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { render, screen } from "@testing-library/react";
import { Tooltip, TooltipProvider } from "@vector-im/compound-web";
import { afterEach, describe, expect, test } from "vitest";

import { PortalRoot } from "./PortalRoot";

describe("PortalRoot", () => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  afterEach(() => root.replaceChildren());

  // A label tooltip is in the DOM from the start, hidden by the stylesheet until
  // hovered, which is what makes it show as bare text when it lands outside the
  // root
  const tree = (
    <TooltipProvider>
      <Tooltip label="Mute microphone">
        <button>mic</button>
      </Tooltip>
    </TooltipProvider>
  );

  test("Compound's tooltips float into the root", () => {
    render(<PortalRoot root={root}>{tree}</PortalRoot>);
    expect(root).toContainElement(
      screen.getByRole("button", { name: "Mute microphone" }),
    );
    expect(root).toContainElement(screen.getByText("Mute microphone"));
  });

  test("without it they float into the body", () => {
    render(tree);
    expect(root).not.toContainElement(screen.getByText("Mute microphone"));
    expect(document.body).toContainElement(screen.getByText("Mute microphone"));
  });
});

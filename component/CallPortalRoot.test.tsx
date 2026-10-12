/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { type ReactNode } from "react";
import { Tooltip, TooltipProvider } from "@vector-im/compound-web";

import { CallPortalRoot } from "./CallPortalRoot";

// A button whose accessible name comes from its tooltip, as every icon button
// in the call does: the name is lost whenever the tooltip has nowhere to go.
const LabelledButton = (): ReactNode => (
  <TooltipProvider>
    <Tooltip label="Microphone">
      <button>🎤</button>
    </Tooltip>
  </TooltipProvider>
);

test("floats into the host document with no root", () => {
  render(
    <CallPortalRoot root={undefined}>
      <LabelledButton />
    </CallPortalRoot>,
  );
  expect(screen.getByRole("button", { name: "Microphone" })).toBeTruthy();
});

test("floats into the root it is given", () => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  render(
    <CallPortalRoot root={root}>
      <LabelledButton />
    </CallPortalRoot>,
  );
  const button = screen.getByRole("button", { name: "Microphone" });
  const label = document.getElementById(
    button.getAttribute("aria-labelledby")!,
  );
  expect(root.contains(label)).toBe(true);
  root.remove();
});

test("waits for a root that is not available yet", () => {
  render(
    <CallPortalRoot root={null}>
      <LabelledButton />
    </CallPortalRoot>,
  );
  expect(screen.queryByRole("button", { name: "Microphone" })).toBeNull();
});

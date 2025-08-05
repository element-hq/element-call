/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@vector-im/compound-web";

import { AppBar } from "./AppBar";

describe("AppBar", () => {
  it("renders", () => {
    const { container } = render(
      <TooltipProvider>
        <AppBar>
          <p>This is the content.</p>
        </AppBar>
      </TooltipProvider>,
    );
    expect(container).toMatchSnapshot();
  });
});

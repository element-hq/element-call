/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, type ReactNode } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@vector-im/compound-web";

import { AppBar, useAppBarSubtitle, useAppBarTitle } from "./AppBar";

const content = <p>This is the content.</p>;

function snapshotAppBar(content: ReactNode): void {
  const { container } = render(
    <TooltipProvider>
      <AppBar>{content}</AppBar>
    </TooltipProvider>,
  );
  expect(container).toMatchSnapshot();
}

describe("AppBar", () => {
  it("renders", () => snapshotAppBar(content));

  it("renders with title and subtitle", () => {
    const TestComponent: FC = () => {
      useAppBarTitle("Title");
      useAppBarSubtitle("Subtitle");
      return content;
    };
    snapshotAppBar(<TestComponent />);
  });
});

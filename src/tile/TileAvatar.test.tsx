/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, describe, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { TileAvatar } from "./TileAvatar";

describe("TileAvatar", () => {
  it("should show loading spinner when loading", () => {
    render(
      <TileAvatar id="@a:example.org" name="Alice" size={96} loading={true} />,
    );
    screen.getByLabelText("Loading…");
  });

  it("should not show loading spinner when not loading", () => {
    render(
      <TileAvatar id="@a:example.org" name="Alice" size={96} loading={false} />,
    );
    expect(screen.queryByLabelText("Loading…")).toBe(null);
  });
});

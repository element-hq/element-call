/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test } from "vitest";
import { render, configure } from "@testing-library/react";

import { QrCode } from "./QrCode";

configure({
  defaultHidden: true,
});

describe("QrCode", () => {
  test("renders", async () => {
    const { container, findByRole } = render(
      <QrCode data="foo" className="bar" />,
    );
    (await findByRole("img")) as HTMLImageElement;
    expect(container.firstChild).toMatchSnapshot();
  });
});

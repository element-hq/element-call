/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";

import { widgetTest } from "../fixtures/widget-user.ts";
import { TestHelpers } from "./test-helpers.ts";
import { averageColour, cameraColour, expectWearing } from "../utils/colour.ts";

// Background effects need WebGL2, and headless Firefox on a CI runner has none,
// so it rightly offers none of them.
test.skip(
  ({ browserName }) => browserName === "firefox",
  "Background effects need WebGL2, which headless Firefox on CI does not have",
);

widgetTest(
  "puts a picture on the preview inside Element Web",
  async ({ asWidget }) => {
    test.slow();
    const { brooks } = asWidget;
    await TestHelpers.startCallInCurrentRoom(brooks.page, false);
    const frame = brooks.page
      .locator('iframe[title="Element Call"]')
      .contentFrame();
    await expect(frame.getByTestId("lobby_joinCall")).toBeVisible();
    const preview = frame.locator("video").first();
    const camera = await cameraColour(preview);

    await frame.getByRole("button", { name: "Camera", exact: true }).click();
    const tile = frame
      .getByRole("group", { name: "Background effects" })
      .getByRole("menuitemradio", { name: "Background 1" });
    const picture = await averageColour(tile.locator("img"));
    await tile.click();
    await expect(tile).toHaveAttribute("aria-checked", "true");
    await expectWearing(preview, picture, camera);
  },
);

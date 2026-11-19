/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";

import { SpaHelpers } from "./spa-helpers.ts";

test("The full screen button can be clicked while the footer overlays the video", async ({
  page,
}) => {
  await page.goto("/");
  await SpaHelpers.createCall(page, "John Doe", "ShortWindow", true);
  await SpaHelpers.expectVideoTilesCount(page, 1);

  const fullScreenButton = page.getByRole("button", { name: "maximise" });
  const footer = page.getByTestId("footer-container");

  // Short enough for the footer to be drawn over the video
  await page.setViewportSize({ width: 1000, height: 500 });
  await expect(fullScreenButton).toBeVisible();
  await page.getByTestId("videoTile").first().hover();
  await expect(footer).toHaveCSS("opacity", "1");

  const buttonBox = (await fullScreenButton.boundingBox())!;
  const footerBox = (await footer.boundingBox())!;
  expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(footerBox.y);

  await fullScreenButton.click();
  await expect
    .poll(async () => page.evaluate(() => document.fullscreenElement !== null))
    .toBe(true);
});

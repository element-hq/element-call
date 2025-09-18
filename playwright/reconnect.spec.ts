/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";

// Skip test for Firefox, due to page.keyboard.press("Tab") not reliable on headless mode
test.skip(
  ({ browserName }) => browserName === "firefox",
  'This test is not working on firefox, page.keyboard.press("Tab") not reliable in headless mode',
);

test("can only interact with header and footer while reconnecting", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("home_callName").click();
  await page.getByTestId("home_callName").fill("Test call");
  await page.getByTestId("home_displayName").click();
  await page.getByTestId("home_displayName").fill("Test user");
  // If we do not call fastForward here, we end up with Date.now() returning an actual timestamp
  // but once we call `await page.clock.fastForward(20000);` later this will reset Date.now() to 0
  // and we will never get into probablyDisconnected state?
  await page.clock.fastForward(10);
  await page.getByTestId("home_go").click();

  await expect(page.locator("video")).toBeVisible();
  await expect(page.getByTestId("lobby_joinCall")).toBeVisible();

  // Join the call
  await page.getByTestId("lobby_joinCall").click();

  // The media tile for the local user should become visible
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await expect(page.getByTestId("name_tag")).toContainText("Test user");

  // Now disconnect from the internet
  await page.route("https://synapse.m.localhost/**/*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 10000));
    await route.continue();
  });
  await page.clock.fastForward(20000);

  await expect(
    page.getByRole("dialog", { name: "Reconnecting…" }),
  ).toBeVisible();

  // Tab order should jump directly from header to footer, skipping media tiles
  await page.getByRole("button", { name: "Mute microphone" }).focus();
  await expect(
    page.getByRole("button", { name: "Mute microphone" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Stop video" })).toBeFocused();
  // Most critically, we should be able to press the hangup button
  await page.getByRole("button", { name: "End call" }).click();
});

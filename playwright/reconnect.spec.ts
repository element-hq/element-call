/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";

test("can only interact with header and footer while reconnecting", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByTestId("home_callName").click();
  await page.getByTestId("home_callName").fill("Test call");
  await page.getByTestId("home_displayName").click();
  await page.getByTestId("home_displayName").fill("Test user");
  await page.getByTestId("home_go").click();

  await expect(page.locator("video")).toBeVisible();
  await expect(page.getByTestId("lobby_joinCall")).toBeVisible();

  // Join the call
  await page.getByTestId("lobby_joinCall").click();

  // The media tile for the local user should become visible
  await expect(page.getByTestId("name_tag")).toContainText("Test user");

  // Now disconnect from the internet
  await page.route("https://synapse.m.localhost/**/*", async (route) =>
    route.abort("internetdisconnected"),
  );
  await page.clock.fastForward(20000);

  await expect(
    page.getByRole("dialog", { name: "Reconnecting…" }),
  ).toBeVisible();
  // Media tile should now be obscured and removed from the accessibility tree
  await expect(page.getByTestId("name_tag")).not.toBeVisible();

  // Tab order should jump directly from header to footer, skipping media tiles
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Encrypted")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Invite" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Unmute microphone" }),
  ).toBeFocused();
  // Most critically, we should be able to press the hangup button
  await page.getByRole("button", { name: "End call" }).click();
});

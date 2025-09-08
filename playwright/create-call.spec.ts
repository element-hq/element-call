/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";

test("Start a new call then leave and show the feedback screen", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByTestId("home_callName").click();
  await page.getByTestId("home_callName").fill("HelloCall");
  await page.getByTestId("home_displayName").click();
  await page.getByTestId("home_displayName").fill("John Doe");
  await page.getByTestId("home_go").click();

  await expect(page.locator("video")).toBeVisible();
  await expect(page.getByTestId("lobby_joinCall")).toBeVisible();

  // Check the button toolbar
  // await expect(page.getByRole('button', { name: 'Mute microphone' })).toBeVisible();
  // await expect(page.getByRole('button', { name: 'Stop video' })).toBeVisible();
  await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("button", { name: "End call" })).toBeVisible();

  // Join the call
  await page.getByTestId("lobby_joinCall").click();

  // Ensure that the call is connected
  await page
    .locator("div")
    .filter({ hasText: /^HelloCall$/ })
    .click();
  // Check the number of participants
  await expect(page.locator("div").filter({ hasText: /^1$/ })).toBeVisible();
  // The tooltip with the name should be visible
  await expect(page.getByTestId("name_tag")).toContainText("John Doe");

  // Resize the window to resemble a small mobile phone
  await page.setViewportSize({ width: 350, height: 660 });
  // We should still be able to send reactions at this screen size
  await expect(page.getByRole("button", { name: "Reactions" })).toBeVisible();

  // leave the call
  await page.getByTestId("incall_leave").click();
  await expect(page.getByRole("heading")).toContainText(
    "John Doe, your call has ended. How did it go?",
  );
  await expect(page.getByRole("main")).toContainText(
    "Why not finish by setting up a password to keep your account?",
  );

  await expect(
    page.getByRole("link", { name: "Not now, return to home screen" }),
  ).toBeVisible();
});

/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { test, expect } from "@playwright/test";

test("has title", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Element Call/);
});

test("Landing page", async ({ page }) => {
  await page.goto("/");

  // There should be a login button in the header
  await expect(page.getByRole("link", { name: "Log In" })).toBeVisible();

  await expect(
    page.getByRole("heading", { name: "Start new call" }),
  ).toBeVisible();

  await expect(page.getByTestId("home_callName")).toBeVisible();
  await expect(page.getByTestId("home_displayName")).toBeVisible();

  await expect(page.getByTestId("home_go")).toBeVisible();
});

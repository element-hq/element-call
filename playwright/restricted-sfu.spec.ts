/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";
import { sleep } from "matrix-js-sdk/lib/utils.js";

test("Should request JWT token before starting the call", async ({ page }) => {
  await page.goto("/");

  let sfGetTimestamp = 0;
  let sendStateEventTimestamp = 0;
  await page.route(
    "**/matrix-rtc.m.localhost/livekit/jwt/sfu/get",
    async (route) => {
      await sleep(2000); // Simulate very slow request
      await route.continue();
      sfGetTimestamp = Date.now();
    },
  );

  await page.route(
    "**/state/org.matrix.msc3401.call.member/**",
    async (route) => {
      await route.continue();
      sendStateEventTimestamp = Date.now();
    },
  );

  await page.getByTestId("home_callName").click();
  await page.getByTestId("home_callName").fill("HelloCall");
  await page.getByTestId("home_displayName").click();
  await page.getByTestId("home_displayName").fill("John Doe");
  await page.getByTestId("home_go").click();

  // Join the call
  await page.getByTestId("lobby_joinCall").click();
  await page.waitForTimeout(4000);
  // Ensure that the call is connected
  await page
    .locator("div")
    .filter({ hasText: /^HelloCall$/ })
    .click();

  expect(sfGetTimestamp).toBeGreaterThan(0);
  expect(sendStateEventTimestamp).toBeGreaterThan(0);
  expect(sfGetTimestamp).toBeLessThan(sendStateEventTimestamp);
});

test("Error when pre-warming the focus are caught by the ErrorBoundary", async ({
  page,
}) => {
  await page.goto("/");

  await page.route("**/openid/request_token", async (route) => {
    await route.fulfill({
      status: 418, // Simulate an error not retryable
    });
  });

  await page.getByTestId("home_callName").click();
  await page.getByTestId("home_callName").fill("HelloCall");
  await page.getByTestId("home_displayName").click();
  await page.getByTestId("home_displayName").fill("John Doe");
  await page.getByTestId("home_go").click();

  // Join the call
  await page.getByTestId("lobby_joinCall").click();

  // Should fail
  await expect(page.getByText("Something went wrong")).toBeVisible();
});

/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";

test("Should show error screen if fails to get JWT token", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("home_callName").click();
  await page.getByTestId("home_callName").fill("HelloCall");
  await page.getByTestId("home_displayName").click();
  await page.getByTestId("home_displayName").fill("John Doe");
  await page.getByTestId("home_go").click();

  await page.route(
    "**/openid/request_token",
    async (route) =>
      await route.fulfill({
        // 418 is a non retryable error, so test will fail immediately
        status: 418,
      }),
  );

  // Join the call
  await page.getByTestId("lobby_joinCall").click();

  // Should fail
  await expect(page.getByText("Something went wrong")).toBeVisible();
  await expect(page.getByText("OPEN_ID_ERROR")).toBeVisible();
});

test("Should automatically retry non fatal JWT errors", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === "firefox",
    "The test to check the video visibility is not working in Firefox CI environment. looks like video is disabled?",
  );
  await page.goto("/");

  await page.getByTestId("home_callName").click();
  await page.getByTestId("home_callName").fill("HelloCall");
  await page.getByTestId("home_displayName").click();
  await page.getByTestId("home_displayName").fill("John Doe");
  await page.getByTestId("home_go").click();

  let firstCall = true;
  let hasRetriedCallback: (value: PromiseLike<void> | void) => void;
  const hasRetriedPromise = new Promise<void>((resolve) => {
    hasRetriedCallback = resolve;
  });
  await page.route("**/openid/request_token", async (route) => {
    if (firstCall) {
      firstCall = false;
      await route.fulfill({
        status: 429,
      });
    } else {
      await route.continue();
      hasRetriedCallback();
    }
  });

  // Join the call
  await page.getByTestId("lobby_joinCall").click();
  // Expect that the call has been retried
  await hasRetriedPromise;
  await expect(page.getByTestId("video").first()).toBeVisible();
});

test("Should show error screen if call creation is restricted", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === "firefox",
    "The is test is not working on firefox CI environment.",
  );
  await page.goto("/");

  // We need the socket connection to fail, but this cannot be done by using the websocket route.
  // Instead, we will trick the app by returning a bad URL for the SFU that will not be reachable an error out.
  await page.route(
    "**/matrix-rtc.m.localhost/livekit/jwt/sfu/get",
    async (route) =>
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          url: "wss://badurltotricktest/livekit/sfu",
          jwt: "FAKE",
        }),
      }),
  );

  // Then if the socket connection fails, livekit will try to validate the token!
  // Livekit will not auto_create anymore and will return a 404 error.
  await page.route(
    "**/badurltotricktest/livekit/sfu/rtc/validate?**",
    async (route) =>
      await route.fulfill({
        status: 404,
        contentType: "text/plain",
        body: "requested room does not exist",
      }),
  );

  await page.pause();

  await page.getByTestId("home_callName").click();
  await page.getByTestId("home_callName").fill("HelloCall");
  await page.getByTestId("home_displayName").click();
  await page.getByTestId("home_displayName").fill("John Doe");
  await page.getByTestId("home_go").click();

  // Join the call
  await page.getByTestId("lobby_joinCall").click();

  await page.pause();
  // Should fail
  await expect(page.getByText("Failed to create call")).toBeVisible();
  await expect(
    page.getByText(
      /Call creation might be restricted to authorized users only/,
    ),
  ).toBeVisible();
});

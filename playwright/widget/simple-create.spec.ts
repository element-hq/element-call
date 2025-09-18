/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";

import { widgetTest } from "../fixtures/widget-user.ts";

// Skip test, including Fixtures
widgetTest.skip(
  ({ browserName }) => browserName === "firefox",
  "This test is not working on firefox, after hangup brooks is locked in a strange state with a blank widget",
);

widgetTest("Start a new call as widget", async ({ asWidget, browserName }) => {
  test.slow(); // Triples the timeout

  const { brooks, whistler } = asWidget;

  await expect(
    brooks.page.getByRole("button", { name: "Video call" }),
  ).toBeVisible();
  await brooks.page.getByRole("button", { name: "Video call" }).click();

  await expect(
    brooks.page.getByRole("menuitem", { name: "Legacy Call" }),
  ).toBeVisible();
  await expect(
    brooks.page.getByRole("menuitem", { name: "Element Call" }),
  ).toBeVisible();

  await brooks.page.getByRole("menuitem", { name: "Element Call" }).click();

  await expect(
    brooks.page
      .locator('iframe[title="Element Call"]')
      .contentFrame()
      .getByTestId("lobby_joinCall"),
  ).toBeVisible();

  await brooks.page
    .locator('iframe[title="Element Call"]')
    .contentFrame()
    .getByTestId("lobby_joinCall")
    .click();

  // Check the join indicator on the room list
  await expect(
    brooks.page
      .locator('iframe[title="Element Call"]')
      .contentFrame()
      .getByRole("button", { name: "End call" }),
  ).toBeVisible();

  // Join from the other side
  await expect(whistler.page.getByText("Video call started")).toBeVisible();
  await expect(
    whistler.page.getByRole("button", { name: "Join" }),
  ).toBeVisible();
  await whistler.page.getByRole("button", { name: "Join" }).click();

  // Currently disabled due to recent Element Web is bypassing Lobby
  // await expect(
  //   whistler.page
  //     .locator('iframe[title="Element Call"]')
  //     .contentFrame()
  //     .getByTestId("lobby_joinCall"),
  // ).toBeVisible();
  //
  // await whistler.page
  //   .locator('iframe[title="Element Call"]')
  //   .contentFrame()
  //   .getByTestId("lobby_joinCall")
  //   .click();

  // Currrenty disabled due to recent Element Web not indicating the number of participants
  // await expect(
  //   whistler.page.locator("div").filter({ hasText: /^Joined • 2$/ }),
  // ).toBeVisible();

  // await expect(
  //   brooks.page.locator("div").filter({ hasText: /^Joined • 2$/ }),
  // ).toBeVisible();

  // Whistler leaves
  await whistler.page.waitForTimeout(1000);
  await whistler.page
    .locator('iframe[title="Element Call"]')
    .contentFrame()
    .getByTestId("incall_leave")
    .click();

  // Brooks leaves
  await brooks.page
    .locator('iframe[title="Element Call"]')
    .contentFrame()
    .getByTestId("incall_leave")
    .click();

  await expect(whistler.page.locator(".mx_BasicMessageComposer")).toBeVisible();
  await expect(brooks.page.locator(".mx_BasicMessageComposer")).toBeVisible();
});

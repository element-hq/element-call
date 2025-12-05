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

widgetTest("Exit a widget in the error screen", async ({ asWidget }) => {
  test.slow(); // Triples the timeout

  const { brooks } = asWidget;

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

  const widgetContent = brooks.page
    .locator('iframe[title="Element Call"]')
    .contentFrame();
  await widgetContent.getByTestId("lobby_joinCall").click();

  await widgetContent.getByRole("button", { name: "Settings" }).click();
  await widgetContent.getByRole("tab", { name: "Preferences" }).click();
  await widgetContent.getByText("Developer mode", { exact: true }).click();
  await widgetContent.getByRole("tab", { name: "Developer" }).click();
  await widgetContent.getByRole("button", { name: "CrashMe" }).click();
  await widgetContent.getByRole("button", { name: "Close" }).click();

  await expect(brooks.page.locator(".mx_BasicMessageComposer")).toBeVisible();
});

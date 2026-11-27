/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";

import { widgetTest } from "../fixtures/widget-user.ts";
import { TestHelpers } from "./test-helpers.ts";

widgetTest.skip(
  ({ browserName }) => browserName === "firefox",
  "Widget specs only run on Chromium, see simple-create.spec.ts",
);

widgetTest(
  "Switching rooms away from a crashed call dismisses it for good",
  async ({ asWidget }) => {
    test.slow();
    const { brooks } = asWidget;
    const page = brooks.page;
    const call = page.locator('iframe[title="Element Call"]');
    const callFrame = call.contentFrame();

    // Somewhere to switch to once the call has crashed
    await TestHelpers.createRoom("Other Room", page);
    await TestHelpers.switchToRoomNamed(page, "Welcome Room");

    await TestHelpers.startCallInCurrentRoom(page);
    // A dev server compiles the widget on first load
    await expect(callFrame.getByTestId("lobby_joinCall")).toBeVisible({
      timeout: 30000,
    });
    await TestHelpers.joinCallFromLobby(page);
    await expect(
      callFrame.getByRole("button", { name: "End call" }),
    ).toBeVisible();

    // Crash the call from its developer settings
    await callFrame.getByRole("button", { name: "Settings" }).click();
    await callFrame.getByRole("tab", { name: "Preferences" }).click();
    await callFrame.getByText("Developer mode", { exact: true }).check();
    await callFrame.getByRole("tab", { name: "Developer" }).click();
    await callFrame.getByRole("button", { name: "Throw test error" }).click();
    await expect(callFrame.getByText("Something went wrong")).toBeVisible();

    // Showing the call collapses the room list
    await TestHelpers.expandRoomList(page);
    await TestHelpers.switchToRoomNamed(page, "Other Room");
    await expect(
      page.getByRole("banner").getByRole("heading", { name: "Other Room" }),
    ).toBeVisible();

    // The crashed call is gone and stays gone: no restart, no reconnect
    await expect(call).toHaveCount(0);
    await page.waitForTimeout(5000);
    await expect(call).toHaveCount(0);
    await expect(
      page.getByRole("banner").getByRole("heading", { name: "Other Room" }),
    ).toBeVisible();
  },
);

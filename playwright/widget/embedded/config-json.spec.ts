/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, type Route, test } from "@playwright/test";

import { widgetTest } from "../../fixtures/widget-user.ts";
import { HOST2, TestHelpers } from "../test-helpers.ts";

/** Where the other site's Element Web serves the embedded package from */
const CONFIG_JSON = "**/widgets/element-call/config.json";

const HOST_ANSWERS: Record<string, (route: Route) => Promise<void>> = {
  "a 404": async (route) => route.fulfill({ status: 404 }),
  "a failed fetch": async (route) => route.abort("failed"),
  "an HTML page": async (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>Element</title>",
    }),
};

widgetTest.skip(
  ({ browserName }) => browserName === "firefox",
  "The widget suite does not run on Firefox, see the other specs here",
);

for (const [answer, respond] of Object.entries(HOST_ANSWERS)) {
  widgetTest(
    `reaches the lobby when config.json gets ${answer}`,
    async ({ addUser }) => {
      const { page } = await addUser("Brooks", HOST2);
      await TestHelpers.createRoom("Config Room", page);

      let answered = 0;
      await page.route(CONFIG_JSON, async (route) => {
        answered++;
        await respond(route);
      });

      await TestHelpers.startCallInCurrentRoom(page);

      await expect(
        page
          .locator('iframe[title="Element Call"]')
          .contentFrame()
          .getByTestId("lobby_joinCall"),
      ).toBeVisible({ timeout: 15000 });
      expect(answered).toBeGreaterThan(0);
    },
  );
}

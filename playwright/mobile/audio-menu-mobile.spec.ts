/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";

test("no audio menu during a call on mobile", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("home_callName").fill("Audio menu");
  await page.getByTestId("home_displayName").fill("Mobile");
  await page.getByTestId("home_go").click();
  await expect(page.getByTestId("lobby_joinCall")).toBeVisible();

  // Before joining, the microphone chevron exists and opens the full menu.
  const chevron = page.getByRole("button", { name: "Microphone" });
  await expect(chevron).toBeVisible();
  await chevron.click();
  // On mobile the menu is a drawer named after its title rather than headed
  // by it.
  const menu = page.getByRole("menu", { name: "Audio controls" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("meter")).toBeVisible();
  await expect(menu.getByRole("slider")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();

  // During the call, the microphone button stands alone: no chevron, no menu.
  await page.getByTestId("lobby_joinCall").click();
  await expect(page.getByTestId("incall_mute")).toBeVisible();
  await expect(page.getByTestId("incall_leave")).toBeVisible();
  await expect(chevron).toHaveCount(0);
});

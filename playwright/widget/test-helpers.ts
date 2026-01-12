/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, type Page } from "@playwright/test";

export class TestHelpers {
  public static async startCallInCurrentRoom(
    page: Page,
    voice: boolean = false,
  ): Promise<void> {
    const buttonName = voice ? "Voice call" : "Video call";
    await expect(page.getByRole("button", { name: buttonName })).toBeVisible();
    await page.getByRole("button", { name: buttonName }).click();

    await expect(
      page.getByRole("menuitem", { name: "Element Call" }),
    ).toBeVisible();

    await page.getByRole("menuitem", { name: "Element Call" }).click();
  }
}

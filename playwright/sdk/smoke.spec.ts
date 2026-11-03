/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";

import { startPair, tileOf } from "./harness.ts";

/**
 * The MatrixRTC SDK driven through its harness in `sdk/dev`: no Element Call
 * on the page, only the SDK's public API.
 */

// Two browsers each log in, set up crypto and sync before anything is on
// screen, then wait for media to connect
test.describe.configure({ timeout: 300_000 });

test("two browsers see each other in one session", async ({ browser }) => {
  const { pages, users } = await startPair(browser, "sdksmoke");

  // Each page shows itself and the other, each tile named by its user
  for (const page of pages) {
    await expect(page.getByTestId("member")).toHaveCount(2, {
      timeout: 60_000,
    });
    for (const user of users)
      await expect(tileOf(page, user)).toContainText(user.displayName);
  }
});

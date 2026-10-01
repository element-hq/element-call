/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Browser, expect, type Page, test } from "@playwright/test";

import { createUsersAndRoom, startHarness } from "./harness.ts";

/**
 * The MatrixRTC SDK driven through its harness in `sdk/dev`: no Element Call
 * on the page, only the SDK's public API.
 *
 * This is the smoke test the implementation is built against. It fails until
 * `createRtcSession` does something, and it fails on the status line first, so
 * the SDK's own error is what the report shows.
 */

// Two browsers each log in, set up crypto and sync before anything is on
// screen, then wait for media to connect
test.describe.configure({ timeout: 300_000 });

test("two browsers see each other in one session", async ({ browser }) => {
  const { usernames, roomId } = await createUsersAndRoom("sdksmoke");
  const [pageA, pageB] = await Promise.all(
    usernames.map(async () => newPage(browser)),
  );

  await Promise.all([
    startHarness(pageA, usernames[0], roomId),
    startHarness(pageB, usernames[1], roomId),
  ]);

  // Each page shows itself and the other, each tile named by its user
  for (const page of [pageA, pageB]) {
    await expect(page.getByTestId("member")).toHaveCount(2, {
      timeout: 60_000,
    });
    for (const username of usernames)
      await expect(
        page.getByTestId("member").filter({ hasText: username }),
      ).toHaveCount(1);
  }
});

/**
 * A context of its own per user, since a browser profile holds one login. No
 * permissions to grant: each browser is launched with fake media that is
 * handed out without asking (see playwright.config.ts).
 */
async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  return context.newPage();
}

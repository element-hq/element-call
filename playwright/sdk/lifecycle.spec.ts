/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";

import { startPair, tileOf, waitForConnected } from "./harness.ts";

/**
 * Members coming and going: a member that leaves disappears for the peer, one
 * that comes back is shown again, and the harness is left in the state its
 * status line claims.
 */

test.describe.configure({ timeout: 300_000 });

test("a member that leaves disappears for the peer", async ({ browser }) => {
  const {
    pages: [leaver, stayer],
    users: [leaving, staying],
  } = await startPair(browser, "sdkleave");
  await expect(stayer.getByTestId("member")).toHaveCount(2, {
    timeout: 60_000,
  });

  await leaver.getByRole("button", { name: "Leave" }).click();
  await expect(leaver.getByTestId("status")).toHaveText("Left");
  await expect(leaver.getByTestId("member")).toHaveCount(0);

  await expect(tileOf(stayer, leaving)).toHaveCount(0, { timeout: 60_000 });
  await expect(tileOf(stayer, staying)).toHaveCount(1);
  await expect(stayer.getByTestId("status")).toHaveText("connected");
});

test("a member that reloads is shown again with its media", async ({
  browser,
}) => {
  const {
    pages: [reloader, watcher],
    users: [reloading],
  } = await startPair(browser, "sdkreload");
  await expect(watcher.getByTestId("member")).toHaveCount(2, {
    timeout: 60_000,
  });

  // The page comes back on the same device, so the new membership replaces
  // the old one rather than sitting next to it
  await reloader.reload();
  await reloader.getByRole("button", { name: "Start" }).click();
  await waitForConnected(reloader);

  await expect(tileOf(watcher, reloading)).toHaveCount(1, {
    timeout: 120_000,
  });
  const video = tileOf(watcher, reloading).locator("video");
  await expect
    .poll(async () => video.evaluate((v: HTMLVideoElement) => v.videoWidth), {
      timeout: 60_000,
    })
    .toBeGreaterThan(0);
  await expect(reloader.getByTestId("member")).toHaveCount(2, {
    timeout: 60_000,
  });
});

/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";

import { widgetTest } from "../fixtures/widget-user.ts";
import { HOST1, TestHelpers } from "./test-helpers.ts";

widgetTest("Sharing screen in group call", async ({ addUser, browserName }) => {
  test.skip(
    browserName === "firefox",
    "The is test is not working on firefox CI environment. No mic/audio device inputs so cam/mic are disabled",
  );

  test.slow(); // We are registering multiple users here, give it more time

  const [alice, bob, carol] = await Promise.all([
    addUser("Alice", HOST1),
    addUser("Bob", HOST1),
    addUser("Carol", HOST1),
  ]);

  const roomName = "Meeting Room";
  await TestHelpers.createRoom(roomName, alice.page, [bob.mxId, carol.mxId]);

  for (const user of [bob, carol]) {
    // Accept the invite
    // This isn't super stable to get this as this super generic locator,
    // but it works for now.
    await TestHelpers.acceptRoomInvite(roomName, user.page);
  }

  await TestHelpers.startCallInCurrentRoom(alice.page, false);
  await expect(
    alice.page.locator('iframe[title="Element Call"]'),
  ).toBeVisible();

  await TestHelpers.joinCallFromLobby(alice.page);

  for (const user of [bob, carol]) {
    await TestHelpers.joinCallInCurrentRoom(user.page);
  }

  for (const user of [alice, bob, carol]) {
    const frame = user.page
      .locator('iframe[title="Element Call"]')
      .contentFrame();

    // Expect 3 video tiles
    await expect(frame.locator("video")).toHaveCount(3, {
      timeout: 10000,
    });
  }

  // await alice.page.pause();

  await alice.page
    .locator('iframe[title="Element Call"]')
    .contentFrame()
    .getByRole("switch", { name: "Share screen" })
    .click();

  // await alice.page.pause();

  for (const user of [alice, bob, carol]) {
    const frame = user.page
      .locator('iframe[title="Element Call"]')
      .contentFrame();

    // Expect 4 (3 + screen share) video tiles
    await expect(frame.locator("video")).toHaveCount(4, {
      timeout: 5000,
    });

    await expect(
      frame.locator('video[data-lk-source="screen_share"]'),
    ).toHaveCount(1);
  }

  // Alice should be in grid mode as she is local sharing
  {
    const frame = alice.page
      .locator('iframe[title="Element Call"]')
      .contentFrame();
    await expect(frame.getByRole("radio", { name: "Grid" })).toBeChecked();
  }

  // Others should have switched to spotlight
  for (const user of [bob, carol]) {
    const frame = user.page
      .locator('iframe[title="Element Call"]')
      .contentFrame();

    await expect(frame.getByRole("radio", { name: "Spotlight" })).toBeChecked();
  }
  // await alice.page.pause();
  // await bob.page.pause();

  // Let's start another screen share from bob
  await bob.page
    .locator('iframe[title="Element Call"]')
    .contentFrame()
    .getByRole("switch", { name: "Share screen" })
    .click();

  {
    const frame = carol.page
      .locator('iframe[title="Element Call"]')
      .contentFrame();

    // Expect 5 (2 + screen share) video tiles
    await expect(frame.locator("video")).toHaveCount(5, {
      timeout: 5000,
    });

    await expect(
      frame.locator('video[data-lk-source="screen_share"]'),
    ).toHaveCount(2);

    // Expect 2 indicators at the bottom
    await expect(frame.getByTestId("screenshare-indicator")).toHaveCount(2);

    // Check the first indicator is visible
    await expect(
      frame.getByTestId("screenshare-indicator").first(),
    ).toHaveAttribute("data-visible", "true");

    await carol.page.pause();

    // now click on next
    await expect(frame.getByRole("button", { name: "Next" })).toBeVisible();
    await frame.getByRole("button", { name: "Next" }).click();

    // Check the second indicator is visible
    await expect(
      frame.getByTestId("screenshare-indicator").nth(1),
    ).toHaveAttribute("data-visible", "true");
    // the first one should be grayed out
    await expect(
      frame.getByTestId("screenshare-indicator").first(),
    ).toHaveAttribute("data-visible", "false");

    // There should be a prev button now
    await expect(frame.getByRole("button", { name: "Back" })).toBeVisible();

    // await carol.page.pause();
  }
});

/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";

import { widgetTest } from "../fixtures/widget-user.ts";
import { HOST1, TestHelpers } from "./test-helpers.ts";

widgetTest("Create and join a group call", async ({ addUser, browserName }) => {
  // increase the timeouts, it is a long test and it is annoying to retry from the beginning for a single timeout.
  test.slow();

  test.skip(
    browserName === "firefox",
    "The is test is not working on firefox CI environment. No mic/audio device inputs so cam/mic are disabled",
  );

  const [valere, timo, robin, halfshot, florian] = await Promise.all([
    addUser("Valere", HOST1),
    addUser("Timo", HOST1),
    addUser("Robin", HOST1),
    addUser("Halfshot", HOST1),
    addUser("florian", HOST1),
  ]);

  const roomName = "Group Call Room";
  await TestHelpers.createRoom(roomName, valere.page, [
    timo.mxId,
    robin.mxId,
    halfshot.mxId,
    florian.mxId,
  ]);

  for (const user of [timo, robin, halfshot, florian]) {
    // Accept the invite
    // This isn't super stable to get this as this super generic locator,
    // but it works for now.
    await TestHelpers.acceptRoomInvite(roomName, user.page);
  }

  // Start the call as Valere
  await TestHelpers.startCallInCurrentRoom(valere.page, false);
  await expect(
    valere.page.locator('iframe[title="Element Call"]'),
  ).toBeVisible();

  await TestHelpers.joinCallFromLobby(valere.page);

  await Promise.all(
    [timo, robin, halfshot, florian].map(async (user) => {
      await TestHelpers.joinCallInCurrentRoom(user.page);
    }),
  );

  await Promise.all(
    [timo, robin, halfshot, florian].map(async (user) => {
      const frame = user.page
        .locator('iframe[title="Element Call"]')
        .contentFrame();
      await expect(
        frame.getByRole("switch", { name: "Stop video", checked: true }),
      ).toBeVisible({
        timeout: 10000,
      });
    }),
  );

  // We should see 5 video tiles everywhere now
  await Promise.all(
    [valere, timo, robin, halfshot, florian].map(async (user) => {
      const frame = user.page
        .locator('iframe[title="Element Call"]')
        .contentFrame();
      await expect(frame.getByTestId("videoTile")).toHaveCount(5, {
        timeout: 15000,
      });

      await Promise.all(
        [valere, timo, robin, halfshot, florian].map(async (user) => {
          // Check the names are correct
          await expect(frame.getByText(user.displayName)).toBeVisible();
        }),
      );

      // No one should be waiting for media
      await expect(frame.getByText("Waiting for media...")).not.toBeVisible({
        // Use a bigger timeout here
        timeout: 10000,
      });

      // There should be 5 video elements, visible and autoplaying
      await expect(frame.locator("video")).toHaveCount(5);
      await expect(frame.locator("video[autoplay]")).toHaveCount(5);

      await TestHelpers.expectVisibleVideoCount(frame, 5);
    }),
  );

  // Quickly test muting one participant to see it reflects and that our asserts works
  const florianFrame = florian.page
    .locator('iframe[title="Element Call"]')
    .contentFrame();
  const florianVideoButton = florianFrame.getByRole("switch", {
    name: /video/,
  });
  await expect(florianVideoButton).toHaveAccessibleName("Stop video");
  await expect(florianVideoButton).toBeChecked();
  await florianVideoButton.click();
  // Now the button should indicate we can start video
  await expect(florianVideoButton).toHaveAccessibleName("Start video");
  await expect(florianVideoButton).not.toBeChecked();

  {
    const frame = valere.page
      .locator('iframe[title="Element Call"]')
      .contentFrame();

    await expect(frame.locator("video")).toHaveCount(5, {
      timeout: 10000,
    });

    // out of 5 ONLY 4 are visible (display:block) !!
    await TestHelpers.expectVisibleVideoCount(frame, 4);
  }
});

/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";

import { widgetTest } from "../fixtures/widget-user.ts";
import { HOST1, TestHelpers } from "./test-helpers.ts";

widgetTest("Put call in PIP", async ({ addUser, browserName }) => {
  test.skip(
    browserName === "firefox",
    "The is test is not working on firefox CI environment. No mic/audio device inputs so cam/mic are disabled",
  );

  test.slow();

  const valere = await addUser("Valere", HOST1);
  const timo = await addUser("Timo", HOST1);

  const callRoom = "TeamRoom";
  await TestHelpers.createRoom(callRoom, valere.page, [timo.mxId]);

  await TestHelpers.createRoom("DoubleTask", valere.page);

  await TestHelpers.acceptRoomInvite(callRoom, timo.page);

  await TestHelpers.switchToRoomNamed(valere.page, callRoom);

  // Start the call as Valere
  await TestHelpers.startCallInCurrentRoom(valere.page, false);
  await expect(
    valere.page.locator('iframe[title="Element Call"]'),
  ).toBeVisible();

  await TestHelpers.joinCallFromLobby(valere.page);

  await TestHelpers.joinCallInCurrentRoom(timo.page);

  const frame = timo.page
    .locator('iframe[title="Element Call"]')
    .contentFrame();

  // check that the video is on
  await expect(
    frame.getByRole("switch", { name: "Stop video", checked: true }),
  ).toBeVisible({
    // Increase timeout, as this expect was flaky
    timeout: 15000,
  });

  // Switch to the other room, the call should go to PIP
  await TestHelpers.switchToRoomNamed(valere.page, "DoubleTask");

  // We should see the PIP overlay
  await expect(valere.page.getByTestId("widget-pip-container")).toBeVisible();

  {
    // wait a bit so that the PIP has rendered the video
    await valere.page.waitForTimeout(600);

    // Check for a bug where the video had the wrong fit in PIP
    const frame = valere.page
      .locator('iframe[title="Element Call"]')
      .contentFrame();

    await expect(frame.locator("video")).toHaveCount(1, { timeout: 10000 });

    const videoElements = await frame.locator("video").all();

    const pipVideo = videoElements[0];
    await expect(pipVideo).toHaveCSS("object-fit", "cover");
  }
});

/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";

import { widgetTest } from "../fixtures/widget-user.ts";
import { HOST1, TestHelpers } from "./test-helpers.ts";

widgetTest("Footer interaction in PiP", async ({ addUser, browserName }) => {
  test.skip(
    browserName === "firefox",
    "The is test is not working on firefox CI environment. No mic/audio device inputs so cam/mic are disabled",
  );

  const valere = await addUser("Valere", HOST1);

  const callRoom = "CallRoom";
  await TestHelpers.createRoom("CallRoom", valere.page);

  await TestHelpers.createRoom("OtherRoom", valere.page);

  await TestHelpers.switchToRoomNamed(valere.page, callRoom);

  // Start the call as Valere
  await TestHelpers.startCallInCurrentRoom(valere.page, false);
  await expect(
    valere.page.locator('iframe[title="Element Call"]'),
  ).toBeVisible();

  await TestHelpers.joinCallFromLobby(valere.page);
  // wait a bit so that the PIP has rendered
  await valere.page.waitForTimeout(600);

  // Switch to the other room, the call should go to PIP
  await TestHelpers.switchToRoomNamed(valere.page, "OtherRoom");

  // We should see the PIP overlay
  const iFrame = valere.page
    .locator('iframe[title="Element Call"]')
    .contentFrame();

  {
    // Check for a bug where the video had the wrong fit in PIP
    const audioBtn = iFrame.getByRole("switch", { name: /microphone/ });
    const videoBtn = iFrame.getByRole("switch", { name: /video/ });
    await expect(
      iFrame.getByRole("button", { name: "End call" }),
    ).toBeVisible();
    await expect(audioBtn).toBeVisible();
    await expect(videoBtn).toBeVisible();
    await expect(audioBtn).toHaveAccessibleName("Mute microphone");
    await expect(audioBtn).toBeChecked();
    await expect(videoBtn).toHaveAccessibleName("Stop video");
    await expect(videoBtn).toBeChecked();

    await videoBtn.click();
    await audioBtn.click();

    // stop hovering on any of the buttons
    await iFrame.getByTestId("videoTile").hover();

    await expect(audioBtn).toHaveAccessibleName("Unmute microphone");
    await expect(audioBtn).not.toBeChecked();
    await expect(videoBtn).toHaveAccessibleName("Start video");
    await expect(videoBtn).not.toBeChecked();
  }
});

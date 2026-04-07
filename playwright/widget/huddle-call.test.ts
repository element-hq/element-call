/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";

import { widgetTest } from "../fixtures/widget-user.ts";
import { HOST1, TestHelpers } from "./test-helpers.ts";

widgetTest("Create and join a group call", async ({ addUser, browserName }) => {
  test.skip(
    browserName === "firefox",
    "The is test is not working on firefox CI environment. No mic/audio device inputs so cam/mic are disabled",
  );

  const valere = await addUser("Valere", HOST1);
  const timo = await addUser("Timo", HOST1);
  const robin = await addUser("Robin", HOST1);
  const halfshot = await addUser("Halfshot", HOST1);
  const florian = await addUser("florian", HOST1);

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

  for (const user of [timo, robin, halfshot, florian]) {
    await TestHelpers.joinCallInCurrentRoom(user.page);
  }

  for (const user of [timo, robin, halfshot, florian]) {
    const frame = user.page
      .locator('iframe[title="Element Call"]')
      .contentFrame();
    // No lobby, should start with video on
    await expect(
      frame.getByRole("switch", { name: "Stop video", checked: true }),
    ).toBeVisible();
  }

  // We should see 5 video tiles everywhere now
  for (const user of [valere, timo, robin, halfshot, florian]) {
    const frame = user.page
      .locator('iframe[title="Element Call"]')
      .contentFrame();
    await expect(frame.getByTestId("videoTile")).toHaveCount(5);
    for (const participant of [valere, timo, robin, halfshot, florian]) {
      // Check the names are correct
      await expect(frame.getByText(participant.displayName)).toBeVisible();
    }

    // There is no other options than to wait for all media to be ready?
    // Or it is too flaky :/
    await user.page.waitForTimeout(5000);
    // No one should be waiting for media
    await expect(frame.getByText("Waiting for media...")).not.toBeVisible();

    // There should be 5 video elements, visible and autoplaying
    const videoElements = await frame.locator("video").all();
    expect(videoElements.length).toBe(5);
    await expect(frame.locator("video[autoplay]")).toHaveCount(5);

    const blockDisplayCount = await frame
      .locator("video")
      .evaluateAll(
        (videos: Element[]) =>
          videos.filter(
            (v: Element) => window.getComputedStyle(v).display === "block",
          ).length,
      );
    expect(blockDisplayCount).toBe(5);
  }

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

  // wait a bit for the state to propagate
  await valere.page.waitForTimeout(3000);
  {
    const frame = valere.page
      .locator('iframe[title="Element Call"]')
      .contentFrame();

    const videoElements = await frame.locator("video").all();
    expect(videoElements.length).toBe(5);

    const blockDisplayCount = await frame
      .locator("video")
      .evaluateAll(
        (videos: Element[]) =>
          videos.filter(
            (v: Element) => window.getComputedStyle(v).display === "block",
          ).length,
      );

    // out of 5 ONLY 4 are visible (display:block) !!
    // XXX we need to be better at our HTML markup and accessibility, it would make
    // this kind of stuff way easier to test if we could look out for aria attributes.
    expect(blockDisplayCount).toBe(4);
  }
});

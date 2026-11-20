/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test, type Page } from "@playwright/test";

import { widgetTest } from "../fixtures/widget-user.ts";
import { TestHelpers } from "./test-helpers.ts";

widgetTest.use({ callType: "dm" });

// The bug from issue #4403, in a real call between two users in Element Web.
// 1. Brooks' browser is made slow: it lists its camera and microphone only
//    after the call is on screen.
// 2. Brooks starts a video call in a DM. A DM call has no lobby.
// 3. Whistler picks up.
// 4. Brooks' camera button shows "on".
// 5. Whistler must see two videos: their own and the one brooks sends.
// Before the fix whistler saw only their own video.
//
// What it guards: the unit tests only check the mute button's own logic. This
// test checks the whole chain: button, call, SFU, and what the other person
// really sees. The bug depends on timing (camera listed before or after the
// call opens), so the normal DM call tests pass by luck most of the time.
// This test forces the bad timing every run, so a regression shows up always
// and not only sometimes.
widgetTest(
  "Publishes a camera the browser lists only once the call is on screen",
  async ({ asWidget, browserName }) => {
    test.skip(
      browserName === "firefox",
      "The is test is not working on firefox CI environment. No mic/audio device inputs so cam/mic are disabled",
    );

    // Two Element Webs and a real call.
    test.slow();
    const { brooks, whistler } = asWidget;
    await listDevicesOnlyInTheCall(brooks.page);

    await TestHelpers.startCallInCurrentRoom(brooks.page, false);
    await expect(whistler.page.getByText("Incoming video call")).toBeVisible();
    await whistler.page
      .getByRole("alert")
      .getByRole("button", { name: "Join" })
      .click();

    const brooksFrame = brooks.page
      .locator('iframe[title="Element Call"]')
      .contentFrame();
    await expect(
      brooksFrame.getByRole("switch", { name: "Stop video", checked: true }),
    ).toBeVisible();

    // Whistler's own camera and the one brooks sends
    const whistlerFrame = whistler.page
      .locator('iframe[title="Element Call"]')
      .contentFrame();
    await TestHelpers.expectVisibleVideoCount(whistlerFrame, 2);
    await expect(whistlerFrame.getByText("Waiting for media...")).toHaveCount(
      0,
    );
  },
);

/**
 * Holds the device list back in the widget until the call view shows a tile,
 * as a browser that is slow to answer does. Call before the widget loads.
 *
 * How: it replaces the browser's `enumerateDevices` with one that waits. It
 * checks every 50ms whether a video tile is on the page, waits half a second
 * more, and only then gives the real list. Element Web itself (the outer
 * page) is left alone; only the call inside the iframe is slowed down.
 */
async function listDevicesOnlyInTheCall(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (window.parent === window) return;
    const devices = navigator.mediaDevices;
    const enumerate = devices.enumerateDevices.bind(devices);
    const inTheCall = new Promise<void>((resolve) => {
      const poll = setInterval(() => {
        if (document.querySelector("[data-testid='videoTile']") === null)
          return;
        clearInterval(poll);
        setTimeout(resolve, 500);
      }, 50);
    });
    devices.enumerateDevices = async (): Promise<MediaDeviceInfo[]> => {
      await inTheCall;
      return enumerate();
    };
  });
}

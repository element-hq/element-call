/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";

import { widgetTest } from "../fixtures/widget-user";
import { HOST1, HOST2, type RtcMode, TestHelpers } from "./test-helpers";

const modePairs: [RtcMode, RtcMode][] = [
  ["compat", "compat"],
  ["legacy", "legacy"],
  ["legacy", "compat"],
  ["compat", "legacy"],
];

modePairs.forEach(([rtcMode1, rtcMode2]) => {
  widgetTest(
    `Test federated call with rtc modes ${rtcMode1} and ${rtcMode2}`,
    async ({ addUser, browserName }) => {
      test.skip(
        browserName === "firefox",
        "The is test is not working on firefox CI environment. No mic/audio device inputs so cam/mic are disabled",
      );

      const florian = await addUser("floriant", HOST1);
      const timo = await addUser("timo", HOST2);

      const roomName = "Call Room";

      await TestHelpers.createRoom(roomName, florian.page, [timo.mxId]);

      await TestHelpers.acceptRoomInvite(roomName, timo.page);

      await florian.page.pause();

      await TestHelpers.setEmbeddedElementCallRtcMode(florian.page, rtcMode1);
      await TestHelpers.setEmbeddedElementCallRtcMode(timo.page, rtcMode2);

      await TestHelpers.startCallInCurrentRoom(florian.page, false);
      await TestHelpers.joinCallFromLobby(florian.page);

      // timo joins
      await TestHelpers.joinCallInCurrentRoom(timo.page);

      // We should see 2 video tiles everywhere now
      for (const user of [timo, florian]) {
        const frame = user.page
          .locator('iframe[title="Element Call"]')
          .contentFrame();
        await expect(frame.getByTestId("videoTile")).toHaveCount(2);

        // There are no other options than to wait for all media to be ready?
        // Or it is too flaky :/
        await user.page.waitForTimeout(3000);
        // No one should be waiting for media
        await expect(frame.getByText("Waiting for media...")).not.toBeVisible();

        // There should be 5 video elements, visible and autoplaying
        const videoElements = await frame.locator("video").all();
        expect(videoElements.length).toBe(2);

        const blockDisplayCount = await frame
          .locator("video")
          .evaluateAll(
            (videos: Element[]) =>
              videos.filter(
                (v: Element) => window.getComputedStyle(v).display === "block",
              ).length,
          );
        expect(blockDisplayCount).toBe(2);
      }

      // await florian.page.pause();
    },
  );
});

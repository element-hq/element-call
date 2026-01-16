/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";

import { widgetTest } from "../fixtures/widget-user";
import { HOST1, HOST2, TestHelpers } from "./test-helpers";

// ## Issue
// This test reproduces an issue with the publisher.
// When switching local focus, we need to recreate the publisher.
// This failed because of a dead lock in the old publishers destruction.
//
// There are numerus ways to enforece this situation:
//  - oldest member swap (manually set the oldest member focus and leave with the prev oldest member)
//    This almost never happens in the real worls since clients will set their preferredFoci list to what the oldest member is.
//  - switch from oldest member to multi sfu as the NOT the first joiner + the first joiner is on a different sfu than your preferred sfu.
//
// This test uses the "switch from oldest member to multi sfu" approach.
//
// It is a copy of federated-call.test.ts in the `["legacy", "legacy"]` setup,
// which once connected will make the second user switch to multi sfu.
widgetTest(
  `Test swapping publisher from ${HOST1} to ${HOST2}`,
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

    await TestHelpers.openWidgetSetEmbeddedElementCallRtcModeCloseWidget(
      florian.page,
      "legacy",
    );
    await TestHelpers.openWidgetSetEmbeddedElementCallRtcModeCloseWidget(
      timo.page,
      "legacy",
    );

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

      // There should be 2 video elements, visible and autoplaying
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

    // now we switch the mode for timo (second joiner on multi-sfu HOST2 but currently HOST1)
    await TestHelpers.setEmbeddedElementCallRtcMode(timo.page, "compat");
    await timo.page.waitForTimeout(3000);
    const blockDisplayCount = await timo.page
      .locator('iframe[title="Element Call"]')
      .contentFrame()
      .locator("video")
      .evaluateAll(
        (videos: Element[]) =>
          videos.filter(
            (v: Element) => window.getComputedStyle(v).display === "block",
          ).length,
      );
    expect(blockDisplayCount).toBe(2);
  },
);

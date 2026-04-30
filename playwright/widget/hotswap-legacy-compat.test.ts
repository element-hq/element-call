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
    test.slow();
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

      // Wait for "Waiting for media..." to disappear (with timeout)
      await expect(frame.getByText("Waiting for media...")).not.toBeVisible({
        timeout: 10000, // Maximum time to wait
      });

      // There should be 2 video elements, visible and autoplaying
      await expect(frame.locator("video")).toHaveCount(2, {
        timeout: 10000,
      });

      await TestHelpers.expectVisibleVideoCount(frame, 2);
    }

    // now we switch the mode for timo (second joiner on multi-sfu HOST2 but currently HOST1)
    await TestHelpers.setEmbeddedElementCallRtcMode(timo.page, "compat");
    await timo.page.waitForTimeout(3000);

    await TestHelpers.expectVisibleVideoCount(
      timo.page.locator('iframe[title="Element Call"]').contentFrame(),
      2,
    );
  },
);

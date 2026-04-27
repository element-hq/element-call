/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";

import { widgetTest } from "../fixtures/widget-user";
import { HOST1, HOST2, TestHelpers } from "./test-helpers";

widgetTest(
  "Bug new joiner was not publishing on correct SFU",
  async ({ addUser, browserName }) => {
    test.skip(
      browserName === "firefox",
      "This is a bug in the old widget, not a browser problem.",
    );

    test.slow();

    // 2 users in federation
    const florian = await addUser("floriant", HOST1);
    const timo = await addUser("timo", HOST2);

    // Florian creates a room and invites Timo to it
    const roomName = "Call Room";
    await TestHelpers.createRoom(roomName, florian.page, [timo.mxId]);

    // Timo joins the room
    await TestHelpers.acceptRoomInvite(roomName, timo.page);

    // Ensure we are in legacy mode (should be the default)
    await TestHelpers.openWidgetSetEmbeddedElementCallRtcModeCloseWidget(
      florian.page,
      "legacy",
    );
    await TestHelpers.openWidgetSetEmbeddedElementCallRtcModeCloseWidget(
      timo.page,
      "legacy",
    );

    // Let timo create a call
    await TestHelpers.startCallInCurrentRoom(timo.page, false);
    await TestHelpers.joinCallFromLobby(timo.page);

    // We want to simulate that the oldest membership authentication is way slower than
    // the preffered auth.
    // In this setup, timo advertised$ transport will be it's own, and the active will be the one from florian
    await florian.page.route(
      "**/matrix-rtc.othersite.m.localhost/livekit/jwt/**",
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2000)); // 5 second delay
        await route.continue();
      },
    );

    // Florian joins the call
    await expect(florian.page.getByTestId("join-call-button")).toBeVisible();
    await florian.page.getByTestId("join-call-button").click();
    await TestHelpers.joinCallFromLobby(florian.page);

    await florian.page.waitForTimeout(3000);
    await timo.page.waitForTimeout(3000);

    // We should see 2 video tiles everywhere now
    for (const user of [timo, florian]) {
      const frame = user.page
        .locator('iframe[title="Element Call"]')
        .contentFrame();
      await expect(frame.getByTestId("videoTile")).toHaveCount(2);

      // No one should be waiting for media
      await expect(frame.getByText("Waiting for media...")).not.toBeVisible();

      // There should be 2 video elements, visible and autoplaying
      await expect(frame.locator("video")).toHaveCount(2, {
        timeout: 10000,
      });

      await TestHelpers.expectVisibleVideoCount(frame, 2);
    }
  },
);

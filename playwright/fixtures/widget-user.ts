/*
Copyright 2025 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Page, test, expect, type JSHandle } from "@playwright/test";

import type { MatrixClient } from "matrix-js-sdk";
import { HOST1, TestHelpers } from "../widget/test-helpers.ts";

export type UserBaseFixture = {
  mxId: string;
  displayName: string;
  page: Page;
  clientHandle: JSHandle<MatrixClient>;
};

export type BaseWidgetSetup = {
  brooks: UserBaseFixture;
  whistler: UserBaseFixture;
};

export interface MyFixtures {
  asWidget: BaseWidgetSetup;
  callType: "room" | "dm";
  addUser: (username: string, host: string) => Promise<UserBaseFixture>;
}

export const widgetTest = test.extend<MyFixtures>({
  // allow per-test override: `widgetTest.use({ callType: "dm" })`
  callType: ["room", { option: true }],
  asWidget: async ({ browser, callType }, pUse, testInfo) => {
    // Tests in parallel workers can reach this in the same millisecond.
    const uniqueSuffix = `${Date.now()}_${testInfo.parallelIndex}`;
    const brooksDisplayName = `brooks_${uniqueSuffix}`;
    const whistlerDisplayName = `whistler_${uniqueSuffix}`;

    // Register users
    const {
      page: ewPage1,
      clientHandle: brooksClientHandle,
      mxId: brooksMxId,
    } = await TestHelpers.registerUser(browser, brooksDisplayName);
    const {
      page: ewPage2,
      clientHandle: whistlerClientHandle,
      mxId: whistlerMxId,
    } = await TestHelpers.registerUser(browser, whistlerDisplayName);

    // Invite the second user
    if (callType === "room") {
      await TestHelpers.createRoom("Welcome Room", ewPage1);

      await ewPage1
        .getByRole("button", { name: "Invite to this room", exact: true })
        .click({
          timeout: 10000,
        });
      await expect(
        ewPage1.getByRole("heading", { name: "Invite to Welcome Room" }),
      ).toBeVisible();

      // To get the invite textbox we need to specifically select within the
      // dialog, since there is another textbox in the background (the message
      // composer). In theory the composer shouldn't be visible to Playwright at
      // all because the invite dialog has trapped focus, but the focus trap
      // doesn't quite work right on Firefox.
      await ewPage1.getByRole("dialog").getByRole("textbox").fill(whistlerMxId);
      await ewPage1.getByRole("dialog").getByRole("textbox").click();
      await ewPage1.getByRole("button", { name: "Invite" }).click();
      await TestHelpers.dismissInviteUnknownUserModal(ewPage1);

      // Accept the invite
      await TestHelpers.openRoomInvite(ewPage2, "Welcome Room");
      await ewPage2.getByRole("button", { name: "Accept" }).click();
      await expect(
        ewPage2
          .getByRole("main")
          .getByRole("heading", { name: "Welcome Room" }),
      ).toBeVisible();
    } else if (callType === "dm") {
      await TestHelpers.chooseFromRoomListNewMenu(ewPage1, "Start chat");
      await ewPage1.getByRole("textbox", { name: "Search" }).click();
      await ewPage1.getByRole("textbox", { name: "Search" }).fill(whistlerMxId);
      await ewPage1.getByRole("button", { name: "Go" }).click();
      await TestHelpers.dismissInviteUnknownUserModalDM(ewPage1);

      // Wait and send the first message to create the DM
      await expect(
        ewPage1.getByText(/Send your first message to invite/),
      ).toBeVisible();

      await ewPage1.locator(".mx_BasicMessageComposer_input > div").click();
      await ewPage1
        .getByRole("textbox", { name: "Send a message…" })
        .fill("Hello!");
      await ewPage1.getByRole("button", { name: "Send message" }).click();

      await expect(
        ewPage1.getByText("This is the beginning of your"),
      ).toBeVisible();

      // Accept the DM invite from brooks
      await TestHelpers.openRoomInvite(ewPage2, brooksDisplayName);
      await ewPage2.getByRole("button", { name: "Start chatting" }).click();
    }

    // Renamed use to pUse, as a workaround for eslint error that was thinking this use was a react use.
    await pUse({
      brooks: {
        mxId: brooksMxId,
        page: ewPage1,
        clientHandle: brooksClientHandle,
        displayName: brooksDisplayName,
      },
      whistler: {
        mxId: whistlerMxId,
        page: ewPage2,
        clientHandle: whistlerClientHandle,
        displayName: whistlerDisplayName,
      },
    });
  },

  /**
   * Provide a way to add additional users within a test.
   * The returned user will be registered on the default homeserver, the name will be made unique by appending a timestamp.
   */
  addUser: async ({ browser }, use, testInfo) => {
    await use(
      async (
        username: string,
        host: string = HOST1,
      ): Promise<UserBaseFixture> => {
        // Tests in parallel workers can reach this in the same millisecond.
        const uniqueSuffix = `${Date.now()}_${testInfo.parallelIndex}`;
        const { page, clientHandle, mxId } = await TestHelpers.registerUser(
          browser,
          `${username.toLowerCase()}_${uniqueSuffix}`,
          host,
        );
        return {
          mxId,
          displayName: username,
          page,
          clientHandle,
        };
      },
    );
  },
});

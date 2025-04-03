/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Page, test, expect, type JSHandle } from "@playwright/test";

import type { MatrixClient } from "matrix-js-sdk/src";

export type UserBaseFixture = {
  mxId: string;
  page: Page;
  clientHandle: JSHandle<MatrixClient>;
};

export type BaseWidgetSetup = {
  brooks: UserBaseFixture;
  whistler: UserBaseFixture;
};

export interface MyFixtures {
  asWidget: BaseWidgetSetup;
}

const PASSWORD = "foobarbaz1!";

// Minimal config.json for the local element-web instance
const CONFIG_JSON = {
  default_server_config: {
    "m.homeserver": {
      base_url: "http://synapse.localhost:8008",
      server_name: "synapse.localhost",
    },
  },

  element_call: {
    url: "https://localhost:3000",
    participant_limit: 8,
    brand: "Element Call",
  },

  // The default language is set here for test consistency
  setting_defaults: {
    language: "en-GB",
    feature_group_calls: true,
  },

  // the location tests want a map style url.
  map_style_url:
    "https://api.maptiler.com/maps/streets/style.json?key=fU3vlMsMn4Jb6dnEIFsx",

  features: {
    // We don't want to go through the feature announcement during the e2e test
    feature_release_announcement: false,
    feature_element_call_video_rooms: true,
    feature_video_rooms: true,
    feature_group_calls: true,
  },
};

export const widgetTest = test.extend<MyFixtures>({
  asWidget: async ({ browser, context }, pUse) => {
    await context.route(`http://localhost:8081/config.json*`, async (route) => {
      await route.fulfill({ json: CONFIG_JSON });
    });

    const userA = `brooks_${Date.now()}`;
    const userB = `whistler_${Date.now()}`;

    const user1Context = await browser.newContext({
      reducedMotion: "reduce",
    });
    const ewPage1 = await user1Context.newPage();
    // Register the first user
    await ewPage1.goto("http://localhost:8081/#/welcome");
    await ewPage1.getByRole("link", { name: "Create Account" }).click();
    await ewPage1.getByRole("textbox", { name: "Username" }).fill(userA);
    await ewPage1
      .getByRole("textbox", { name: "Password", exact: true })
      .fill(PASSWORD);
    await ewPage1.getByRole("textbox", { name: "Confirm password" }).click();
    await ewPage1
      .getByRole("textbox", { name: "Confirm password" })
      .fill(PASSWORD);
    await ewPage1.getByRole("button", { name: "Register" }).click();
    await expect(
      ewPage1.getByRole("heading", { name: `Welcome ${userA}` }),
    ).toBeVisible();

    const brooksClientHandle = await ewPage1.evaluateHandle(() =>
      window.mxMatrixClientPeg.get(),
    );
    const brooksMxId = (await brooksClientHandle.evaluate((cli) => {
      return cli.getUserId();
    }, brooksClientHandle))!;

    const user2Context = await browser.newContext({
      reducedMotion: "reduce",
    });
    const ewPage2 = await user2Context.newPage();
    // Register the second user
    await ewPage2.goto("http://localhost:8081/#/welcome");
    await ewPage2.getByRole("link", { name: "Create Account" }).click();
    await ewPage2.getByRole("textbox", { name: "Username" }).fill(userB);
    await ewPage2
      .getByRole("textbox", { name: "Password", exact: true })
      .fill(PASSWORD);
    await ewPage2.getByRole("textbox", { name: "Confirm password" }).click();
    await ewPage2
      .getByRole("textbox", { name: "Confirm password" })
      .fill(PASSWORD);
    await ewPage2.getByRole("button", { name: "Register" }).click();
    await expect(
      ewPage2.getByRole("heading", { name: `Welcome ${userB}` }),
    ).toBeVisible();

    const whistlerClientHandle = await ewPage2.evaluateHandle(() =>
      window.mxMatrixClientPeg.get(),
    );
    const whistlerMxId = (await whistlerClientHandle.evaluate((cli) => {
      return cli.getUserId();
    }, whistlerClientHandle))!;

    // Invite the second user
    await ewPage1.getByRole("button", { name: "Add room" }).click();
    await ewPage1.getByText("New room").click();
    await ewPage1.getByRole("textbox", { name: "Name" }).fill("Welcome Room");
    await ewPage1.getByRole("button", { name: "Create room" }).click();
    await expect(ewPage1.getByText("You created this room.")).toBeVisible();
    await expect(ewPage1.getByText("Encryption enabled")).toBeVisible();

    await ewPage1
      .getByRole("button", { name: "Invite to this room", exact: true })
      .click();
    await expect(
      ewPage1.getByRole("heading", { name: "Invite to Welcome Room" }),
    ).toBeVisible();

    await ewPage1.getByRole("textbox").fill(whistlerMxId);
    await ewPage1.getByRole("textbox").click();
    await ewPage1.getByRole("button", { name: "Invite" }).click();

    // Accept the invite
    await expect(
      ewPage2.getByRole("treeitem", { name: "Welcome Room" }),
    ).toBeVisible();
    await ewPage2.getByRole("treeitem", { name: "Welcome Room" }).click();
    await ewPage2.getByRole("button", { name: "Accept" }).click();
    await expect(
      ewPage2.getByRole("main").getByRole("heading", { name: "Welcome Room" }),
    ).toBeVisible();

    // Renamed use to pUse, as a workaround for eslint error that was thinking this use was a react use.
    await pUse({
      brooks: {
        mxId: brooksMxId,
        page: ewPage1,
        clientHandle: brooksClientHandle,
      },
      whistler: {
        mxId: whistlerMxId,
        page: ewPage2,
        clientHandle: whistlerClientHandle,
      },
    });
  },
});

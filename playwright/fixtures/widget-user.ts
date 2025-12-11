/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type Browser,
  type Page,
  test,
  expect,
  type JSHandle,
} from "@playwright/test";

import type { MatrixClient } from "matrix-js-sdk";

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
      base_url: "https://synapse.m.localhost",
      server_name: "synapse.m.localhost",
    },
  },

  element_call: {
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

/**
 * Set the Element Call URL in the dev tool settings using `window.mxSettingsStore` via `page.evaluate`.
 * @param page
 */
const setDevToolElementCallDevUrl = process.env.USE_DOCKER
  ? async (page: Page): Promise<void> => {
      await page.evaluate(() => {
        window.mxSettingsStore.setValue(
          "Developer.elementCallUrl",
          null,
          "device",
          "http://localhost:8080/room",
        );
      });
    }
  : async (page: Page): Promise<void> => {
      await page.evaluate(() => {
        window.mxSettingsStore.setValue(
          "Developer.elementCallUrl",
          null,
          "device",
          "https://localhost:3000/room",
        );
      });
    };

/**
 * Registers a new user and returns page, clientHandle and mxId.
 */
async function registerUser(
  browser: Browser,
  username: string,
): Promise<{ page: Page; clientHandle: JSHandle<MatrixClient>; mxId: string }> {
  const userContext = await browser.newContext({
    reducedMotion: "reduce",
  });
  const page = await userContext.newPage();
  await page.goto("http://localhost:8081/#/welcome");
  await page.getByRole("link", { name: "Create Account" }).click();
  await page.getByRole("textbox", { name: "Username" }).fill(username);
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill(PASSWORD);
  await page.getByRole("textbox", { name: "Confirm password" }).click();
  await page.getByRole("textbox", { name: "Confirm password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Register" }).click();

  await expect(
    page.getByRole("heading", { name: `Welcome ${username}` }),
  ).toBeVisible();

  const browserUnsupportedToast = page
    .getByText("Element does not support this browser")
    .locator("..")
    .locator("..");

  // Dismiss incompatible browser toast
  const dismissButton = browserUnsupportedToast.getByRole("button", {
    name: "Dismiss",
  });
  try {
    await expect(dismissButton).toBeVisible({ timeout: 700 });
    await dismissButton.click();
  } catch {
    // dismissButton not visible, continue as normal
  }

  await setDevToolElementCallDevUrl(page);

  const clientHandle = await page.evaluateHandle(() =>
    window.mxMatrixClientPeg.get(),
  );
  const mxId = (await clientHandle.evaluate(
    (cli: MatrixClient) => cli.getUserId(),
    clientHandle,
  ))!;

  return { page, clientHandle, mxId };
}

export const widgetTest = test.extend<MyFixtures>({
  asWidget: async ({ browser, context }, pUse) => {
    await context.route(`http://localhost:8081/config.json*`, async (route) => {
      await route.fulfill({ json: CONFIG_JSON });
    });

    const userA = `brooks_${Date.now()}`;
    const userB = `whistler_${Date.now()}`;

    // Register users
    const {
      page: ewPage1,
      clientHandle: brooksClientHandle,
      mxId: brooksMxId,
    } = await registerUser(browser, userA);
    const {
      page: ewPage2,
      clientHandle: whistlerClientHandle,
      mxId: whistlerMxId,
    } = await registerUser(browser, userB);

    // Invite the second user
    await ewPage1
      .getByRole("navigation", { name: "Room list" })
      .getByRole("button", { name: "New conversation" })
      .click();

    await ewPage1.getByRole("menuitem", { name: "New Room" }).click();
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

    // To get the invite textbox we need to specifically select within the
    // dialog, since there is another textbox in the background (the message
    // composer). In theory the composer shouldn't be visible to Playwright at
    // all because the invite dialog has trapped focus, but the focus trap
    // doesn't quite work right on Firefox.
    await ewPage1.getByRole("dialog").getByRole("textbox").fill(whistlerMxId);
    await ewPage1.getByRole("dialog").getByRole("textbox").click();
    await ewPage1.getByRole("button", { name: "Invite" }).click();

    // Accept the invite
    await expect(
      ewPage2.getByRole("option", { name: "Welcome Room" }),
    ).toBeVisible();
    await ewPage2.getByRole("option", { name: "Welcome Room" }).click();
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

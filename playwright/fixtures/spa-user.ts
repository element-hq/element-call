/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { SynapseAdmin } from "../utils/synapse-admin.ts";
import { HOMESERVER_URL } from "../utils/matrix-api.ts";

/** A user of the Playwright backend's homeserver. */
export interface SpaUser {
  /** The localpart actually registered, which carries a unique suffix. */
  username: string;
  mxId: string;
  accessToken: string;
}

export interface SpaFixtures {
  /** Registers a user over the admin API, without a browser session. */
  registerUser: (username: string) => Promise<SpaUser>;
  /** A user registered and logged in to Element Call on the test's page. */
  spaUser: SpaUser;
}

const PASSWORD = "password1!";

// A dev server that was already running keeps whatever config.json it was
// started with, since Playwright reuses it rather than installing the one it
// wants, so the tests serve the config they assert against.
const CONFIG_PATH = fileURLToPath(
  new URL("../../config/config.devenv.json", import.meta.url),
);

export const spaTest = test.extend<SpaFixtures>({
  context: async ({ context }, use) => {
    await context.route(
      "**/config.json",
      async (route) => await route.fulfill({ path: CONFIG_PATH }),
    );
    await use(context);
  },

  registerUser: async ({ browserName }, use) => {
    const admin = SynapseAdmin.forHomeserver(HOMESERVER_URL);
    await use(async (username: string): Promise<SpaUser> => {
      // Every browser and worker registers against the one homeserver.
      const unique = `${username}_${browserName}_${randomUUID().slice(0, 8)}`;
      const registered = await admin.registerUser(unique, PASSWORD);
      return {
        username: unique,
        mxId: registered.user_id,
        accessToken: registered.access_token,
      };
    });
  },

  spaUser: async ({ page, registerUser }, use) => {
    const user = await registerUser("caller");

    await page.goto("/");
    await page.getByTestId("home_login").click();
    await page.getByTestId("login_username").fill(user.username);
    await page.getByTestId("login_password").fill(PASSWORD);
    await page.getByTestId("login_login").click();
    await expect(
      page.getByRole("heading", { name: "Start new call" }),
    ).toBeVisible();

    await use(user);
  },
});

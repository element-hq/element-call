/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type Browser,
  expect,
  type JSHandle,
  type Page,
} from "@playwright/test";
import { type MatrixClient } from "matrix-js-sdk";

const PASSWORD = "foobarbaz1!";

export class TestHelpers {
  public static async startCallInCurrentRoom(
    page: Page,
    voice: boolean = false,
  ): Promise<void> {
    const buttonName = voice ? "Voice call" : "Video call";
    await expect(page.getByRole("button", { name: buttonName })).toBeVisible();
    await page.getByRole("button", { name: buttonName }).click();

    await expect(
      page.getByRole("menuitem", { name: "Element Call" }),
    ).toBeVisible();

    await page.getByRole("menuitem", { name: "Element Call" }).click();
  }

  /**
   * Registers a new user and returns page, clientHandle and mxId.
   */
  public static async registerUser(
    browser: Browser,
    username: string,
  ): Promise<{
    page: Page;
    clientHandle: JSHandle<MatrixClient>;
    mxId: string;
  }> {
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
    await page
      .getByRole("textbox", { name: "Confirm password" })
      .fill(PASSWORD);
    await page.getByRole("button", { name: "Register" }).click();

    await expect(
      page.getByRole("heading", { name: `Welcome ${username}` }),
    ).toBeVisible({
      // Increase timeout as registration can be slow :/
      timeout: 15_000,
    });

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

    await TestHelpers.setDevToolElementCallDevUrl(page);

    const clientHandle = await page.evaluateHandle(() =>
      window.mxMatrixClientPeg.get(),
    );
    const mxId = (await clientHandle.evaluate(
      (cli: MatrixClient) => cli.getUserId(),
      clientHandle,
    ))!;

    return { page, clientHandle, mxId };
  }

  public static async createRoom(
    name: string,
    page: Page,
    andInvite: string[] = [],
  ): Promise<void> {
    await page.pause();
    await page
      .getByRole("navigation", { name: "Room list" })
      .getByRole("button", { name: "New conversation" })
      .click();

    await page.getByRole("menuitem", { name: "New Room" }).click();
    await page.getByRole("textbox", { name: "Name" }).fill(name);
    await page.getByRole("button", { name: "Create room" }).click();
    await expect(page.getByText("You created this room.")).toBeVisible();
    await expect(page.getByText("Encryption enabled")).toBeVisible();

    // Invite users if any
    if (andInvite.length > 0) {
      await page
        .getByRole("button", { name: "Invite to this room", exact: true })
        .click();

      const inviteInput = page.getByRole("dialog").getByRole("textbox");
      for (const mxId of andInvite) {
        await inviteInput.focus();
        await inviteInput.fill(mxId);
        await inviteInput.press("Enter");
      }

      await page.getByRole("button", { name: "Invite" }).click();
    }
  }

  /**
   * Sets the current Element Web app to use the dev Element Call URL.
   * @param page - The EW page
   */
  public static async setDevToolElementCallDevUrl(page: Page): Promise<void> {
    if (process.env.USE_DOCKER) {
      await page.evaluate(() => {
        window.mxSettingsStore.setValue(
          "Developer.elementCallUrl",
          null,
          "device",
          "http://localhost:8080/room",
        );
      });
    } else {
      await page.evaluate(() => {
        window.mxSettingsStore.setValue(
          "Developer.elementCallUrl",
          null,
          "device",
          "https://localhost:3000/room",
        );
      });
    }
  }
}

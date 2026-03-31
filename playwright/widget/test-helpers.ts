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

export const HOST1 = "https://app.m.localhost/#/welcome";
export const HOST2 = "https://app.othersite.m.localhost/#/welcome";

export type RtcMode = "legacy" | "compat" | "2_0";

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

    // TODO: Remove as soon as web merges https://github.com/element-hq/element-web/pull/32755
    await this.dismissFileDialogPermissionIfNeeded(page);
  }

  public static async joinCallFromLobby(page: Page): Promise<void> {
    await expect(
      page
        .locator('iframe[title="Element Call"]')
        .contentFrame()
        .getByTestId("lobby_joinCall"),
    ).toBeVisible();

    await page
      .locator('iframe[title="Element Call"]')
      .contentFrame()
      .getByTestId("lobby_joinCall")
      .click();
  }

  public static async joinCallInCurrentRoom(
    page: Page,
    audioOnly: boolean = false,
  ): Promise<void> {
    // This is the header button that notifies about an ongoing call
    const label = audioOnly ? "Voice call started" : "Video call started";
    await expect(page.getByText(label)).toBeVisible();
    await expect(page.getByRole("button", { name: "Join" })).toBeVisible();
    await page.getByRole("button", { name: "Join" }).click();

    // TODO: Remove as soon as web merges https://github.com/element-hq/element-web/pull/32755
    await this.dismissFileDialogPermissionIfNeeded(page);
  }

  /**
   * Registers a new user and returns page, clientHandle and mxId.
   */
  public static async registerUser(
    browser: Browser,
    username: string,
    host: string = HOST1,
  ): Promise<{
    page: Page;
    clientHandle: JSHandle<MatrixClient>;
    mxId: string;
  }> {
    const userContext = await browser.newContext({
      reducedMotion: "reduce",
    });
    const page = await userContext.newPage();
    await page.goto(host);
    await page.getByRole("link", { name: "Create Account" }).click();
    await page.getByRole("textbox", { name: "Username" }).fill(username);
    await page.getByRole("textbox", { name: "Password", exact: true }).click();
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

    await this.maybeDismissBrowserNotSupportedToast(page);
    await this.maybeDismissServiceWorkerWarningToast(page);

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

  private static async maybeDismissBrowserNotSupportedToast(
    page: Page,
  ): Promise<void> {
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
  }

  private static async maybeDismissServiceWorkerWarningToast(
    page: Page,
  ): Promise<void> {
    const toast = page
      .locator(".mx_Toast_toast")
      .getByText("Failed to load service worker");

    try {
      await expect(toast).toBeVisible({ timeout: 700 });
      await page
        .locator(".mx_Toast_toast")
        .getByRole("button", { name: "OK" })
        .click();
    } catch {
      // toast not visible, continue as normal
    }
  }

  public static async maybeDismissKeyBackupToast(page: Page): Promise<void> {
    const toast = page
      .locator(".mx_Toast_toast")
      .getByText("Back up your chats");

    try {
      await expect(toast).toBeVisible({ timeout: 700 });
      await page
        .locator(".mx_Toast_toast")
        .getByRole("button", { name: "Dismiss" })
        .click();
    } catch {
      // toast not visible, continue as normal
    }
  }

  public static async createRoom(
    name: string,
    page: Page,
    andInvite: string[] = [],
  ): Promise<void> {
    await page
      .getByRole("navigation", { name: "Room list" })
      .getByRole("button", { name: "New conversation" })
      .click();

    await page.getByRole("menuitem", { name: "New Room" }).click();
    await page.getByRole("textbox", { name: "Name" }).fill(name);
    await page.getByRole("button", { name: "Create room" }).click();
    await expect(page.getByText("You created this room.")).toBeVisible();
    await expect(page.getByText("Encryption enabled")).toBeVisible();
    await TestHelpers.maybeDismissKeyBackupToast(page);

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
   * Accepts a room invite using the room name.
   * Locatest the invite in the room list.
   *
   */
  public static async acceptRoomInvite(
    roomName: string,
    page: Page,
  ): Promise<void> {
    await expect(page.getByRole("option", { name: roomName })).toBeVisible();
    await page.getByRole("option", { name: roomName }).click();
    await page.getByRole("button", { name: "Accept" }).click();

    await expect(
      page.getByRole("main").getByRole("heading", { name: roomName }),
    ).toBeVisible();
    await TestHelpers.maybeDismissKeyBackupToast(page);
  }

  /**
   * Opens the widget and then goes to the settings to set the RTC mode.
   * then closes the widget lobby.
   *
   * intended to be used before joining!
   *
   * WORKS IF A ROOM IS CURRENTLY OPENED IN THE PAGE
   */
  public static async openWidgetSetEmbeddedElementCallRtcModeCloseWidget(
    page: Page,
    mode: RtcMode,
  ): Promise<void> {
    await page.getByRole("button", { name: "Video call" }).click();
    await page.getByRole("menuitem", { name: "Element Call" }).click();

    // TODO: Remove as soon as web merges https://github.com/element-hq/element-web/pull/32755
    await this.dismissFileDialogPermissionIfNeeded(page);

    await TestHelpers.setEmbeddedElementCallRtcMode(page, mode);
    await page.getByRole("button", { name: "Close lobby" }).click();
  }

  // TODO: Remove as soon as web merges https://github.com/element-hq/element-web/pull/32755
  public static async dismissFileDialogPermissionIfNeeded(
    page: Page,
  ): Promise<void> {
    const dialogHeading = page.getByRole("heading", {
      name: "Approve widget permissions",
    });

    try {
      await expect(dialogHeading).toBeVisible({ timeout: 3000 });
      await page.getByRole("button", { name: "Approve" }).click();
    } catch {
      // Dialog did not appear, that's fine
    }
  }

  /**
   * Goes to the settings to set the RTC mode.
   * then closes the settings modal.
   *
   * WORKS IF A ROOM IS CURRENTLY SHOWING THE EC WIDGET
   */
  public static async setEmbeddedElementCallRtcMode(
    page: Page,
    mode: RtcMode,
  ): Promise<void> {
    const iframe = page.locator('iframe[title="Element Call"]').contentFrame();

    await iframe.getByRole("button", { name: "Settings" }).click();
    await iframe.getByRole("tab", { name: "Preferences" }).click();

    // await iframe.getByText("Developer mode", { exact: true }).click();
    await iframe.getByText("Developer mode", { exact: true }).check(); // Idempotent:  won't uncheck if already checked

    // Move to Developer tab now
    await iframe.getByRole("tab", { name: "Developer" }).click();
    if (mode == "legacy") {
      await iframe.getByText("Legacy: state events").click();
    } else if (mode == "2_0") {
      await iframe.getByText("Matrix 2.0").click();
    } else {
      // compat
      await iframe.getByText("Compatibility: state events").click();
    }
    await iframe.getByTestId("modal_close").click();
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
          "https://call.m.localhost/room",
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

  /**
   * Switches to a room in the room list by its name.
   * @param page - The EW page
   * @param roomName - The name of the room to switch to
   */
  public static async switchToRoomNamed(
    page: Page,
    roomName: string,
  ): Promise<void> {
    await page.getByRole("option", { name: `Open room ${roomName}` }).click();
  }
}

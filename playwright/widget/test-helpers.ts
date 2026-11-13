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
  type FrameLocator,
  type Locator,
} from "@playwright/test";
import { type MatrixClient } from "matrix-js-sdk";

import { SynapseAdmin } from "../utils/synapse-admin.ts";

const PASSWORD = "foobarbaz1!";

export const HOST1 = "https://app.m.localhost/#/welcome";
export const HOST2 = "https://app.othersite.m.localhost/#/welcome";

export type RtcMode = "compat" | "2_0";

export class TestHelpers {
  public static async startCallInCurrentRoom(
    page: Page,
    voice: boolean = false,
  ): Promise<void> {
    const buttonName = voice ? "Voice call" : "Video call";

    await page.getByRole("button", { name: buttonName }).click({
      timeout: 5000,
    });

    await page.getByRole("menuitem", { name: "Element Call" }).click({
      timeout: 10000,
    });
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

  public static async joinCallInCurrentDM(
    page: Page,
    audioOnly: boolean = false,
  ): Promise<void> {
    await this.joinCallInRoom(page, audioOnly, true);
  }

  public static async joinCallInCurrentRoom(
    page: Page,
    audioOnly: boolean = false,
  ): Promise<void> {
    await this.joinCallInRoom(page, audioOnly, false);
  }

  public static async joinCallInRoom(
    page: Page,
    audioOnly: boolean = false,
    isDM: boolean = false,
  ): Promise<void> {
    await page.waitForTimeout(3000);
    const label = isDM
      ? audioOnly
        ? "Incoming voice call"
        : "Incoming video call"
      : "Group call started";
    await expect(page.getByText(label)).toBeVisible({
      timeout: 10000,
    });
    // XXX This using the notification toast to join the room.
    // Not the buttons in the header or timeline
    await page.getByRole("alert").getByRole("button", { name: "Join" }).click({
      timeout: 5000,
    });
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
    // Determine which homeserver to use based on the host
    const synapseBaseUrl =
      host === HOST2
        ? "https://synapse.othersite.m.localhost"
        : "https://synapse.m.localhost";

    // Register user via Synapse Admin API to speed things up
    const synapseAdmin = SynapseAdmin.forHomeserver(synapseBaseUrl);
    const credentials = await synapseAdmin.registerUser(
      username,
      PASSWORD,
      username,
    );

    // STEP 2: Open browser and login
    const userContext = await browser.newContext({
      reducedMotion: "reduce",
    });
    const page = await userContext.newPage();
    await page.goto(host);

    await page.getByRole("link", { name: "Sign in" }).click({
      timeout: 10000,
    });

    await page.getByRole("textbox", { name: "Username" }).fill(username, {
      timeout: 10000,
    });
    await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD, {
      timeout: 10000,
    });
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(
      page.getByRole("heading", { name: `Welcome ${username}` }),
    ).toBeVisible({
      // Increase timeout here :/ flaky
      timeout: 15000,
    });

    await this.dismissStartupToasts(page);

    // The other site's Element Web opens the embedded package it serves itself
    // (see docker-compose-playwright.yml), not the dev server's app.
    if (host !== HOST2) {
      await TestHelpers.setDevToolElementCallDevUrl(page);
    }

    const clientHandle = await page.evaluateHandle(() =>
      window.mxMatrixClientPeg.get(),
    );
    const mxId = credentials.user_id;
    return { page, clientHandle, mxId };
  }

  // Dismisses the toasts a fresh device gets after sign-in.
  //
  // Toasts stack and only the top one can be dismissed, so look
  // at what is on top each time.
  public static async dismissStartupToasts(page: Page): Promise<void> {
    const expectedToasts: {
      title: string;
      button: string;
      confirm?: string;
    }[] = [
      { title: "Failed to load service worker", button: "OK" },
      { title: "Verify this device", button: "Later" },
      { title: "Back up your chats", button: "Not now" },
      {
        title: "Turn on key storage",
        button: "Dismiss",
        confirm: "Yes, dismiss",
      },
      { title: "Notifications", button: "Dismiss" },
      { title: "Element does not support this browser", button: "Dismiss" },
    ];

    const toast = page.locator(".mx_Toast_toast");
    const toastTitle = toast.locator(".mx_Toast_title h2");

    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        await toast.waitFor({ state: "visible", timeout: 700 });
        const title = await toastTitle.textContent();
        if (!title) break;

        // Find the matching toast config
        const toastConfig = expectedToasts.find((t) => title.includes(t.title));

        if (toastConfig) {
          // Bounded so that a renamed button leaves the toast in place and the
          // next step reports it, instead of hanging until the test timeout.
          await toast
            .getByRole("button", { name: toastConfig.button })
            .click({ timeout: 5000 });
          if (toastConfig.confirm) {
            const dialog = page.getByRole("dialog");
            await dialog
              .getByRole("button", { name: toastConfig.confirm })
              .click({ timeout: 5000 });
            await expect(dialog).toBeHidden({ timeout: 5000 });
          }
          // The same element shows the next toast a moment after the click, so
          // reading it straight away acts on the dismissed one a second time
          await expect(toastTitle).not.toHaveText(title, { timeout: 5000 });
        } else {
          // Unknown toast. We don't want to act on unknown toasts
          break;
        }
      } catch {
        // No toast visible, exit loop
        break;
      }
    }
  }

  public static async expandAllSections(page: Page): Promise<void> {
    try {
      await page
        .getByRole("button", { name: "Expand all sections" })
        .click({ timeout: 2000 });
    } catch {
      // Already expanded or button not present
    }
  }

  public static async createRoom(
    name: string,
    page: Page,
    andInvite: string[] = [],
  ): Promise<void> {
    await TestHelpers.chooseFromRoomListNewMenu(page, "New Room");
    await page.getByRole("textbox", { name: "Name" }).fill(name);
    await page.getByRole("button", { name: "Create room" }).click();
    await expect(page.getByText("You created this room.")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText("Encryption enabled")).toBeVisible();
    await TestHelpers.dismissStartupToasts(page);

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
      await TestHelpers.dismissInviteUnknownUserModal(page);
    }
  }

  /**
   * Opens the room list's "New" menu and picks the given item.
   *
   * Driven by keyboard, as a toast arriving late sits over the button and
   * swallows clicks.
   */
  public static async chooseFromRoomListNewMenu(
    page: Page,
    itemName: string,
  ): Promise<void> {
    await TestHelpers.dismissStartupToasts(page);
    await page
      .getByRole("navigation", { name: "Room list" })
      .getByRole("button", { name: "New", exact: true })
      .press("Enter");
    await page.getByRole("menuitem", { name: itemName }).press("Enter");
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
    await TestHelpers.openRoomInvite(page, roomName);
    await page.getByRole("button", { name: "Accept" }).click({
      timeout: 5000,
    });

    await expect(
      page.getByRole("main").getByRole("heading", { name: roomName }),
    ).toBeVisible();
    await TestHelpers.dismissStartupToasts(page);
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
    await page.getByRole("button", { name: "Video call" }).click({
      timeout: 5000,
    });
    await page.getByRole("menuitem", { name: "Element Call" }).click({
      timeout: 10000,
    });

    await TestHelpers.setEmbeddedElementCallRtcMode(page, mode);
    await page.getByRole("button", { name: "Close lobby" }).click();
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
    if (mode == "2_0") {
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

  public static async expandRoomList(page: Page): Promise<void> {
    await page
      .getByRole("separator", { name: "Click or drag to expand" })
      .click();
  }

  /**
   * Locates a room in the room list by its name.
   *
   * Matches on the aria-label prefix because the item's role differs between
   * the flat room list (`option`) and the sectioned room list (`button`), and
   * the label may carry a suffix such as " invitation.".
   */
  public static roomListItem(page: Page, roomName: string): Locator {
    return page.locator(`[aria-label^="Open room ${roomName}"]`);
  }

  /**
   * Opens a pending invite from the room list by its room name.
   *
   * Element Web collapses the Invites section every time it appears, so it is
   * expanded here once the invite has arrived.
   */
  public static async openRoomInvite(
    page: Page,
    roomName: string,
  ): Promise<void> {
    const invitesSection = page.getByRole("button", {
      name: "Toggle Invites section",
    });
    await expect(invitesSection).toBeVisible({ timeout: 10000 });
    // Toasts sit over the top of the room list, where this header is.
    await TestHelpers.dismissStartupToasts(page);
    if ((await invitesSection.getAttribute("aria-expanded")) !== "true") {
      await invitesSection.click();
    }
    await TestHelpers.roomListItem(page, roomName).click({ timeout: 10000 });
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
    await TestHelpers.expandAllSections(page);
    await TestHelpers.roomListItem(page, roomName).click();
  }

  public static async dismissInviteUnknownUserModal(page: Page): Promise<void> {
    await expect(
      page.getByRole("heading", { name: "Invite new contacts to this" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Invite" }).click({
      timeout: 5000,
    });
  }

  public static async dismissInviteUnknownUserModalDM(
    page: Page,
  ): Promise<void> {
    await expect(
      page.getByRole("heading", {
        name: "Start a chat with this new contact?",
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click({
      timeout: 5000,
    });
  }

  public static async expectVisibleVideoCount(
    frame: FrameLocator,
    count: number,
  ): Promise<void> {
    await expect(frame.locator("video").filter({ visible: true })).toHaveCount(
      count,
      { timeout: 10000 },
    );
  }
}

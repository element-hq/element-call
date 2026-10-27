/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type Browser,
  expect,
  type Locator,
  type Page,
} from "@playwright/test";

import { SynapseAdmin } from "../utils/synapse-admin.ts";

/**
 * Where the SDK harness is served — `sdk/dev`, a page that uses the SDK the way
 * a host would, with none of Element Call in it.
 */
export const SDK_HARNESS_URL = "https://localhost:3002";

const HOMESERVER_URL = "https://synapse.m.localhost";
const PASSWORD = "foobarbaz1!";

/** A registered user, with the session the registration opened. */
export interface User {
  username: string;
  displayName: string;
  userId: string;
  deviceId: string;
  accessToken: string;
}

/**
 * Registers two users through the Synapse admin API and has the first create a
 * public room, so that the second can join it by id without an invite. The
 * registration logs each user in, which spares the harness a `/login` call
 * that the homeserver rate-limits.
 */
export async function createUsersAndRoom(
  name: string,
): Promise<{ users: [User, User]; roomId: string }> {
  const admin = SynapseAdmin.forHomeserver(HOMESERVER_URL);
  const users = (await Promise.all(
    ["a", "b"].map(async (letter, index): Promise<User> => {
      const username = `${name}_${letter}_${Date.now()}`;
      const displayName = `${name} ${"AB"[index]}`;
      const registration = await admin.registerUser(
        username,
        PASSWORD,
        displayName,
      );
      return {
        username,
        displayName,
        userId: registration.user_id,
        deviceId: registration.device_id,
        accessToken: registration.access_token,
      };
    }),
  )) as [User, User];

  const response = await fetch(
    `${HOMESERVER_URL}/_matrix/client/v3/createRoom`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${users[0].accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `${name}'s session`,
        preset: "public_chat",
        // Per-participant media keys travel in encrypted to-device messages,
        // which only reach devices the sender's crypto tracks, and it tracks
        // the members of encrypted rooms
        initial_state: [
          {
            type: "m.room.encryption",
            state_key: "",
            content: { algorithm: "m.megolm.v1.aes-sha2" },
          },
        ],
        // Every member has to be allowed to write its own membership, which
        // a public room does not grant by default; the same levels Element
        // Call gives a room it creates for a call
        power_level_content_override: {
          state_default: 0,
          events_default: 0,
          users_default: 0,
          events: { "org.matrix.msc3401.call.member": 0 },
        },
      }),
    },
  );
  if (!response.ok)
    throw new Error(
      `Could not create a room: ${response.status} ${await response.text()}`,
    );
  const { room_id: roomId } = (await response.json()) as { room_id: string };

  return { users, roomId };
}

/**
 * Opens the harness signed in as the given user and waits until the SDK
 * reports the session as connected. The status line carries the SDK's error
 * if it does not get there, so the failure says why.
 */
export async function startHarness(
  page: Page,
  user: User,
  roomId: string,
): Promise<void> {
  const query = new URLSearchParams({
    homeserver: HOMESERVER_URL,
    accessToken: user.accessToken,
    userId: user.userId,
    deviceId: user.deviceId,
    room: roomId,
  });
  await page.goto(`${SDK_HARNESS_URL}/?${query.toString()}`);
  await page.getByRole("button", { name: "Start" }).click();
  await waitForConnected(page);
}

/**
 * A login, a crypto setup and an initial sync happen before the session can
 * connect. An error is final, so it is not worth waiting out the timeout for
 * "connected" after one.
 */
export async function waitForConnected(page: Page): Promise<void> {
  const status = page.getByTestId("status");
  await expect(status).toHaveText(/^(connected|Error)/, { timeout: 120_000 });
  const text = await status.textContent();
  if (text !== "connected")
    throw new Error(`The harness did not connect to the session: ${text}`);
}

/**
 * A context of its own per user, since a browser profile holds one login. No
 * permissions to grant: each browser is launched with fake media that is
 * handed out without asking (see playwright.config.ts).
 */
export async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  return context.newPage();
}

/** Two users in one session, each on a page of their own. */
export async function startPair(
  browser: Browser,
  name: string,
): Promise<{ pages: [Page, Page]; users: [User, User]; roomId: string }> {
  const { users, roomId } = await createUsersAndRoom(name);
  const pages = await Promise.all([newPage(browser), newPage(browser)]);
  await Promise.all(
    pages.map(async (page, i) => startHarness(page, users[i], roomId)),
  );
  return { pages: pages as [Page, Page], users, roomId };
}

/** The tile a page shows for a user. */
export function tileOf(page: Page, user: User): Locator {
  return page.locator(`[data-testid="member"][data-user-id="${user.userId}"]`);
}

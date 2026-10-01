/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, type Page } from "@playwright/test";

import { SynapseAdmin } from "../utils/synapse-admin.ts";

/**
 * Where the SDK harness is served — `sdk/dev`, a page that uses the SDK the way
 * a host would, with none of Element Call in it.
 */
export const SDK_HARNESS_URL = "https://localhost:3002";

const HOMESERVER_URL = "https://synapse.m.localhost";
const PASSWORD = "foobarbaz1!";

/**
 * Registers two users through the Synapse admin API and has the first create a
 * public room, so that the second can join it by id without an invite.
 */
export async function createUsersAndRoom(
  name: string,
): Promise<{ usernames: [string, string]; roomId: string }> {
  const admin = SynapseAdmin.forHomeserver(HOMESERVER_URL);
  const usernames: [string, string] = [
    `${name}_a_${Date.now()}`,
    `${name}_b_${Date.now()}`,
  ];
  const [{ access_token: accessToken }] = await Promise.all(
    usernames.map(async (username, index) =>
      admin.registerUser(username, PASSWORD, `${name} ${"AB"[index]}`),
    ),
  );

  const response = await fetch(
    `${HOMESERVER_URL}/_matrix/client/v3/createRoom`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `${name}'s session`,
        preset: "public_chat",
      }),
    },
  );
  if (!response.ok)
    throw new Error(
      `Could not create a room: ${response.status} ${await response.text()}`,
    );
  const { room_id: roomId } = (await response.json()) as { room_id: string };

  return { usernames, roomId };
}

/**
 * Opens the harness signed in as the given user and waits until the SDK
 * reports the session as joined. The status line carries the SDK's error if
 * it does not get there, so the failure says why.
 */
export async function startHarness(
  page: Page,
  username: string,
  roomId: string,
): Promise<void> {
  const query = new URLSearchParams({
    homeserver: HOMESERVER_URL,
    username,
    password: PASSWORD,
    room: roomId,
  });
  await page.goto(`${SDK_HARNESS_URL}/?${query.toString()}`);
  await page.getByRole("button", { name: "Start" }).click();

  // A login, a crypto setup and an initial sync happen first. An error is
  // final, so it is not worth waiting out the timeout for "Joined" after one.
  const status = page.getByTestId("status");
  await expect(status).toHaveText(/^(Joined|Error)/, { timeout: 120_000 });
  const text = await status.textContent();
  if (text !== "Joined")
    throw new Error(`The harness did not join the session: ${text}`);
}

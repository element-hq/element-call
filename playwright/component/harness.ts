/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, type Locator, type Page } from "@playwright/test";

import { SynapseAdmin } from "../utils/synapse-admin.ts";

/**
 * Where the component harness is served — `component/dev`, which embeds Element
 * Call the way a host application would. Not the `baseURL` the rest of the
 * suite uses: these tests drive a page that contains Element Call rather than
 * Element Call itself.
 */
export const COMPONENT_HARNESS_URL = "https://localhost:3001";

const HOMESERVER_URL = "https://synapse.m.localhost";
const PASSWORD = "foobarbaz1!";

/**
 * Registers a user through the Synapse admin API and creates a room for it to
 * call in, without touching a browser. The harness signs into this account
 * twice, giving two devices in one page and so a real call between the two
 * components.
 */
export async function createUserAndRoom(
  name: string,
): Promise<{ username: string; roomId: string }> {
  const username = `${name}_${Date.now()}`;
  const { access_token: accessToken } = await SynapseAdmin.forHomeserver(
    HOMESERVER_URL,
  ).registerUser(username, PASSWORD, name);

  const response = await fetch(
    `${HOMESERVER_URL}/_matrix/client/v3/createRoom`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: `${name}'s call`, preset: "private_chat" }),
    },
  );
  if (!response.ok)
    throw new Error(
      `Could not create a room: ${response.status} ${await response.text()}`,
    );
  const { room_id: roomId } = (await response.json()) as { room_id: string };

  return { username, roomId };
}

/**
 * Opens the harness signed in as the given user, and waits for both embedded
 * calls to appear.
 *
 * @returns The two containers the host gave Element Call, in order.
 */
export async function startHarness(
  page: Page,
  username: string,
  roomId: string,
): Promise<Locator> {
  const query = new URLSearchParams({
    homeserver: HOMESERVER_URL,
    username,
    password: PASSWORD,
    room: roomId,
  });
  await page.goto(`${COMPONENT_HARNESS_URL}/?${query.toString()}`);
  await page.getByRole("button", { name: "Start" }).click();

  const panes = page.getByTestId("call-pane");
  // Two logins, two crypto setups and two initial syncs happen first
  await expect(panes).toHaveCount(2, { timeout: 120_000 });
  return panes;
}

/**
 * Asserts that one element is drawn entirely inside another.
 *
 * This is the check that being a component rather than an iframe costs us: an
 * iframe could not paint outside itself whatever its stylesheets said, whereas
 * a component shares the page and has to be made to stay put.
 */
export async function expectWithin(
  inner: Locator,
  outer: Locator,
): Promise<void> {
  await expect(inner).toBeVisible();
  const innerBox = await inner.boundingBox();
  const outerBox = await outer.boundingBox();
  if (innerBox === null || outerBox === null)
    throw new Error("Expected both elements to be laid out");

  // A pixel of slack, for subpixel layout
  const slack = 1;
  expect(innerBox.x).toBeGreaterThanOrEqual(outerBox.x - slack);
  expect(innerBox.y).toBeGreaterThanOrEqual(outerBox.y - slack);
  expect(innerBox.x + innerBox.width).toBeLessThanOrEqual(
    outerBox.x + outerBox.width + slack,
  );
  expect(innerBox.y + innerBox.height).toBeLessThanOrEqual(
    outerBox.y + outerBox.height + slack,
  );
}

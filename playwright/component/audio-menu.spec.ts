/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, type Locator, type Page, test } from "@playwright/test";

import { createUserAndRoom, resizeContainer, startHarness } from "./harness.ts";
import { installFakeDevices } from "../utils/fake-devices.ts";

/**
 * The device menu with Element Call as a component in a host page, where the
 * portalled menu must be sized against the call, not the window. Driven from
 * the lobby: it builds the same menu, without two connections' worth of flake.
 */

// Sign-in, crypto setup and sync happen twice before anything shows.
test.describe.configure({ timeout: 180_000 });

test("sizes the device list against the call, not the window", async ({
  page,
}) => {
  await installFakeDevices(page, { microphones: 20, speakers: 4 });
  const { username, roomId } = await createUserAndRoom("menusize");
  const panes = await startHarness(page, username, roomId);
  const pane = panes.first();

  // A short call in a much taller page.
  const container = pane.getByTestId("call-container");
  await resizeContainer(container, { width: 900, height: 400 });
  await expect(pane.getByTestId("lobby_joinCall")).toBeVisible({
    timeout: 60_000,
  });

  const list = await openDeviceList(page, pane);
  const callHeight = (await container.boundingBox())!.height;
  const windowHeight = page.viewportSize()!.height;
  const listHeight = (await list.boundingBox())!.height;

  expect(callHeight).toBeLessThan(windowHeight * 0.75);
  expect(listHeight).toBeLessThanOrEqual(callHeight);
  expect(listHeight).toBeLessThan(windowHeight * 0.6);
});

test("follows the call area when the host resizes it", async ({ page }) => {
  await installFakeDevices(page, { microphones: 20, speakers: 4 });
  const { username, roomId } = await createUserAndRoom("menuresize");
  const panes = await startHarness(page, username, roomId);
  const pane = panes.first();

  const container = pane.getByTestId("call-container");
  await resizeContainer(container, { width: 900, height: 360 });
  await expect(pane.getByTestId("lobby_joinCall")).toBeVisible({
    timeout: 60_000,
  });

  const list = await openDeviceList(page, pane);
  const whenShort = (await list.boundingBox())!.height;

  // The host grows the call while the menu is open.
  await resizeContainer(container, { width: 900, height: 700 });
  await expect
    .poll(async () => (await list.boundingBox())!.height)
    .toBeGreaterThan(whenShort);
});

test("keeps every device reachable in a small container", async ({ page }) => {
  await installFakeDevices(page, { microphones: 20, speakers: 4 });
  const { username, roomId } = await createUserAndRoom("menureach");
  const panes = await startHarness(page, username, roomId);
  const pane = panes.first();

  const container = pane.getByTestId("call-container");
  await resizeContainer(container, { width: 400, height: 360 });
  await expect(pane.getByTestId("lobby_joinCall")).toBeVisible({
    timeout: 60_000,
  });

  const list = await openDeviceList(page, pane);
  // More devices than fit, so the list must scroll.
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );

  const last = page.getByRole("menuitemradio", { name: "Fake Microphone 20" });
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  // Reachable means clickable: the menu may be drawn outside the call area.
  await last.click();
  await expect(last).toHaveAttribute("aria-checked", "true");
});

test("tracks the focus source of its own call, not the page", async ({
  page,
}) => {
  await installFakeDevices(page);
  const { username, roomId } = await createUserAndRoom("menufocus");
  const panes = await startHarness(page, username, roomId);
  const pane = panes.first();
  const other = panes.nth(1);

  await expect(pane.getByTestId("lobby_joinCall")).toBeVisible({
    timeout: 60_000,
  });
  await openDeviceList(page, pane);
  const menu = page.getByRole("menu");

  // Asserted on the attribute: the component build's scoped stylesheet doesn't
  // reach the portalled menu, so its ring can't be read here.
  await expect(menu).toHaveAttribute("data-focus-source", "pointer");

  // A key pressed in the other call says nothing about this menu.
  await other.evaluate((element) =>
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    ),
  );
  await expect(menu).toHaveAttribute("data-focus-source", "pointer");

  await page.keyboard.press("ArrowDown");
  await expect(menu).toHaveAttribute("data-focus-source", "keyboard");
});

/** Opens a component's microphone menu and returns its device list. */
async function openDeviceList(page: Page, pane: Locator): Promise<Locator> {
  await pane
    .getByRole("button", { name: "Microphone" })
    .click({ timeout: 60_000 });
  await expect(page.getByRole("menu")).toBeVisible();
  const list = page.locator("[role='menu'] div[role='none']").first();
  await expect(list).toBeVisible();
  return list;
}

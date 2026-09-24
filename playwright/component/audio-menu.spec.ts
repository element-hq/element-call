/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, type Locator, type Page, test } from "@playwright/test";

import { createUserAndRoom, resizeContainer, startHarness } from "./harness.ts";
import { installFakeDevices } from "../utils/fake-devices.ts";

/**
 * The device menu where Element Call is a component in a host's page rather
 * than the whole of one.
 *
 * This is the case the stylesheets cannot describe: the menu is portalled to
 * the document, so a container query and a viewport unit both measure the wrong
 * thing — the first has no container to resolve against out there, the second
 * measures a page Element Call does not own. The menu has to be sized against
 * the space the call is actually drawn in.
 *
 * Driven from the lobby rather than a joined call. The footer builds the same
 * menu from the same device behaviours in both, and the container is the same
 * size either way, so joining would only add two connections' worth of flake.
 */

// Signing in, setting up crypto and syncing happen twice before anything is on
// screen, as in component-call.spec.ts
test.describe.configure({ timeout: 180_000 });

test("sizes the device list against the call, not the window", async ({
  page,
}) => {
  await installFakeDevices(page, { microphones: 20, speakers: 4 });
  const { username, roomId } = await createUserAndRoom("menusize");
  const panes = await startHarness(page, username, roomId);
  const pane = panes.first();

  // A short call in a much taller page: the difference between measuring the
  // call and measuring the window.
  const container = pane.getByTestId("call-container");
  await resizeContainer(container, { width: 900, height: 400 });
  await expect(pane.getByTestId("lobby_joinCall")).toBeVisible({
    timeout: 60_000,
  });

  const list = await openDeviceList(page, pane);
  const callHeight = (await container.boundingBox())!.height;
  const windowHeight = page.viewportSize()!.height;
  const listHeight = (await list.boundingBox())!.height;

  // Sized against the call. Were it sized against the window the list would be
  // half as tall again, and the assertion below would not be able to tell.
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

  // The host grows the space Element Call is drawn in while the menu is open —
  // a panel opening, a window dragged, a phone turned. A bound taken once on
  // opening would still describe the smaller call.
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
  // Narrow as well as short, which is where entries get pushed out of reach.
  await resizeContainer(container, { width: 400, height: 360 });
  await expect(pane.getByTestId("lobby_joinCall")).toBeVisible({
    timeout: 60_000,
  });

  const list = await openDeviceList(page, pane);
  // More devices than the space allows, so the list has to scroll rather than
  // put entries somewhere they cannot be got at.
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );

  const last = page.getByRole("menuitemradio", { name: "Fake Microphone 20" });
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  // Reachable means usable, not merely painted: D11 accepts that the menu may
  // be drawn outside the call area, so this asserts reach rather than
  // containment.
  await last.click();
  await expect(last).toHaveAttribute("aria-checked", "true");
});

test("tracks the focus modality of its own call, not the page", async ({
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
  // The menu owns the modality, because every item it can focus has to answer
  // to it — the device rows and the camera menu's blur toggle alike.
  const menu = page.getByRole("menu");

  // Asserted on the attribute rather than the painted ring, which cannot be
  // read here: the menu is portalled outside the call root, and the component
  // build scopes the stylesheet to it, so neither the ring nor the rule that
  // suppresses the browser's own reaches this menu. The paint is asserted
  // standalone instead — in the story and in audio-menu.spec.ts. What is on
  // trial here is which call the tracking answers for.
  await expect(menu).toHaveAttribute("data-focus-modality", "pointer");

  // A key pressed in the other call on this page — or anywhere in the host's
  // own page — says nothing about how this menu is being used.
  await other.evaluate((element) =>
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    ),
  );
  await expect(menu).toHaveAttribute("data-focus-modality", "pointer");

  // A key pressed in this menu does.
  await page.keyboard.press("ArrowDown");
  await expect(menu).toHaveAttribute("data-focus-modality", "keyboard");
});

/**
 * Opens the microphone menu of one component and returns its scrolling device
 * list, which lives outside the component: the menu is portalled to the page.
 */
async function openDeviceList(page: Page, pane: Locator): Promise<Locator> {
  await pane
    .getByRole("button", { name: "Microphone" })
    .click({ timeout: 60_000 });
  await expect(page.getByRole("menu")).toBeVisible();
  const list = page.locator("[role='menu'] div[role='none']").first();
  await expect(list).toBeVisible();
  return list;
}

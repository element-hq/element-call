/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, type Locator, test } from "@playwright/test";

import { createUserAndRoom, expectWithin, startHarness } from "./harness.ts";

/**
 * Element Call embedded as a React component, driven through the development
 * harness in `component/dev`.
 *
 * What these cover that the widget tests cannot is everything that follows from
 * sharing a page with a host: whether Element Call stays inside the space it
 * was given, and whether two of it can exist at once. As a widget, the iframe
 * guaranteed both.
 */

/** The settings button, whichever of the two the footer is currently showing. */
function settingsButton(pane: Locator): Locator {
  return pane
    .getByTestId("settings-bottom-left")
    .or(pane.getByTestId("settings-bottom-center"))
    .filter({ visible: true })
    .first();
}

test("holds a call between two components on one page", async ({ page }) => {
  const { username, roomId } = await createUserAndRoom("twocomponents");
  const panes = await startHarness(page, username, roomId);

  // Each component shows a lobby of its own, and neither has joined anything
  // just by being rendered
  for (const index of [0, 1])
    await expect(panes.nth(index).getByTestId("lobby_joinCall")).toBeVisible({
      timeout: 60_000,
    });

  for (const index of [0, 1])
    await panes.nth(index).getByTestId("lobby_joinCall").click();

  // Two devices of one account, so each component should see itself and the
  // other. This is the part that proves two Element Calls in one page are two
  // calls, and not one shared thing wearing two hats.
  for (const index of [0, 1])
    await expect(panes.nth(index).getByTestId("videoTile")).toHaveCount(2, {
      timeout: 60_000,
    });
});

test("keeps its modals inside the container it was given", async ({ page }) => {
  const { username, roomId } = await createUserAndRoom("containment");
  const panes = await startHarness(page, username, roomId);
  const pane = panes.first();
  const container = pane.getByTestId("call-container");

  await pane.getByTestId("lobby_joinCall").click({ timeout: 60_000 });
  await expect(pane.getByTestId("footer-container")).toBeVisible({
    timeout: 60_000,
  });

  // Both of these are positioned `fixed`, and were centred on the window
  // rather than the container until it was made a containing block. The
  // settings dialog spilled over the host's interface; the reaction picker sat
  // at 82vh, which put it below the container entirely and so out of sight.
  await settingsButton(pane).click();
  await expectWithin(pane.getByRole("dialog"), container);
  await pane.getByTestId("modal_close").click();

  await pane.getByRole("button", { name: "Reactions" }).click();
  await expectWithin(
    pane.getByRole("dialog", { name: "Pick reaction" }),
    container,
  );
});

test("tells its host what it is doing", async ({ page }) => {
  const { username, roomId } = await createUserAndRoom("hostbridge");
  const panes = await startHarness(page, username, roomId);
  const pane = panes.first();
  const log = page.getByTestId("bridge-log");

  // Every component reports to its host through the bridge, whether that host
  // is a widget container or an application embedding it directly
  await expect(log).toContainText("contentLoaded", { timeout: 60_000 });

  await pane.getByTestId("lobby_joinCall").click({ timeout: 60_000 });
  await expect(log).toContainText("notifyJoined", { timeout: 60_000 });
  await expect(log).toContainText("setAlwaysOnScreen(true)", {
    timeout: 60_000,
  });

  // And takes instructions back: the host asking for a mute should come back
  // as the component reporting the new state
  await pane.getByRole("button", { name: "Mute" }).click();
  await expect(log).toContainText("notifyDeviceMute(audio: false", {
    timeout: 30_000,
  });
});

/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, type Locator, type Page, test } from "@playwright/test";

import { createUserAndRoom, resizeContainer, startHarness } from "./harness.ts";
import { averageColour, cameraColour, expectWearing } from "../utils/colour.ts";

// Background effects need WebGL2, and headless Firefox on a CI runner has none,
// so it rightly offers none of them.
test.skip(
  ({ browserName }) => browserName === "firefox",
  "Background effects need WebGL2, which headless Firefox on CI does not have",
);

/**
 * Background effects with Element Call as a component in a host page: the
 * pipeline's model and WebAssembly have to load from the component's bundle,
 * and the portalled menu has to be sized against the call, not the window.
 * Driven from the lobby, which builds the same menu and pipeline.
 */

// Sign-in, crypto setup and sync happen twice before anything shows.
test.describe.configure({ timeout: 180_000 });

test("puts a picture on the call's preview", async ({ page }) => {
  const { username, roomId } = await createUserAndRoom("effects");
  const panes = await startHarness(page, username, roomId);
  const pane = panes.first();
  await resizeContainer(pane.getByTestId("call-container"), {
    width: 900,
    height: 480,
  });
  await expect(pane.getByTestId("lobby_joinCall")).toBeVisible({
    timeout: 60_000,
  });
  const preview = pane.locator("video").first();
  const camera = await cameraColour(preview);

  const tile = await openEffect(page, pane, "Background 1");
  const picture = await averageColour(tile.locator("img"));
  await tile.click();
  await expect(tile).toHaveAttribute("aria-checked", "true");
  await expectWearing(preview, picture, camera);
});

test("keeps every effect reachable in a small container", async ({ page }) => {
  const { username, roomId } = await createUserAndRoom("effectsreach");
  const panes = await startHarness(page, username, roomId);
  const pane = panes.first();
  const container = pane.getByTestId("call-container");
  await resizeContainer(container, { width: 400, height: 360 });
  await expect(pane.getByTestId("lobby_joinCall")).toBeVisible({
    timeout: 60_000,
  });

  const last = await openEffect(page, pane, "Background 2");
  const list = page.locator("[role='menu'] div[role='none']").first();
  expect((await list.boundingBox())!.height).toBeLessThanOrEqual(
    (await container.boundingBox())!.height,
  );
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport({ ratio: 1 });
  await last.click();
  await expect(last).toHaveAttribute("aria-checked", "true");
});

/** Opens a component's camera menu and returns one of its effects. */
async function openEffect(
  page: Page,
  pane: Locator,
  name: string,
): Promise<Locator> {
  await pane
    .getByRole("button", { name: "Camera", exact: true })
    .click({ timeout: 60_000 });
  // Portalled out of the pane, so found on the page.
  return page
    .getByRole("group", { name: "Background effects" })
    .getByRole("menuitemradio", { name });
}

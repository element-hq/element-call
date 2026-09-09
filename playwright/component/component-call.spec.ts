/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, type Locator, type Page, test } from "@playwright/test";

import {
  createUserAndRoom,
  expectWithin,
  resizeContainer,
  startHarness,
} from "./harness.ts";
import { SpaHelpers } from "../spa-helpers.ts";

/**
 * Element Call embedded as a React component, driven through the development
 * harness in `component/dev`.
 *
 * What these cover that the widget tests cannot is everything that follows from
 * sharing a page with a host: whether Element Call stays inside the space it
 * was given, and whether two of it can exist at once. As a widget, the iframe
 * guaranteed both.
 */

// Each test signs in twice, sets up crypto twice and syncs twice before
// anything is on screen, and then waits for media to connect; the waits below
// are sized for that, so the tests have to be too
test.describe.configure({ timeout: 180_000 });

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

  // In the flat container the harness gives it by default, Element Call hides
  // its controls a few seconds after the call starts, as it would in a flat
  // window. A full-size container keeps them on screen to be clicked.
  await resizeContainer(container, { width: 900, height: 640 });
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

test("leaves the host's own page unstyled", async ({ page }) => {
  const { username, roomId } = await createUserAndRoom("hoststyles");
  const panes = await startHarness(page, username, roomId);
  await expect(panes.first().getByTestId("lobby_joinCall")).toBeVisible({
    timeout: 60_000,
  });

  // Element Call's stylesheet is written for a page of its own: normalize.css
  // gives `html` a line height, Compound gives `body` its font and feature
  // settings, and the design tokens live on `:root`. None of that may reach the
  // host's document — the harness sets none of these itself, so anything other
  // than the browser's defaults here came from us.
  const host = await page.evaluate(() => {
    const html = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    return {
      lineHeight: html.lineHeight,
      fontFeatureSettings: body.fontFeatureSettings,
      token: html.getPropertyValue("--cpd-color-text-primary"),
    };
  });
  expect(host).toEqual({
    lineHeight: "normal",
    fontFeatureSettings: "normal",
    token: "",
  });

  // While inside the container, the same rules do apply
  const root = panes.first().locator("[data-element-call-root]");
  await expect(root).toHaveCSS("font-feature-settings", /"kern"/);
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

test("lays itself out for the space it is given, not the page", async ({
  page,
}) => {
  const { username, roomId } = await createUserAndRoom("containersize");
  const panes = await startHarness(page, username, roomId);
  const pane = panes.first();
  const container = pane.getByTestId("call-container");
  const call = pane.locator("[data-layout]");

  await pane.getByTestId("lobby_joinCall").click({ timeout: 60_000 });
  await expect(call).toBeVisible({ timeout: 60_000 });
  await expect(call).not.toHaveAttribute("data-layout", "pip");

  // As a widget, Element Call's container and its window were one and the same:
  // a host wanting a picture-in-picture made the iframe small, and Element Call
  // saw the window shrink. A component gets no such signal from the window,
  // which stays as large as it ever was; only the container changes.
  await resizeContainer(container, { width: 300, height: 300 });
  await expect(call).toHaveAttribute("data-layout", "pip");

  await resizeContainer(container, { width: 900, height: 700 });
  await expect(call).not.toHaveAttribute("data-layout", "pip");
});

/**
 * The shape of a call at whatever size it has been given: the layout it chose,
 * how much of the height the tile and the footer take, and which controls the
 * footer shows. Two calls with the same shape look the same, participants aside.
 */
async function callShape(scope: Page | Locator): Promise<{
  layout: string | null;
  tileHeight: number;
  footerHeight: number;
  buttons: (string | null)[];
}> {
  const call = scope.locator("[data-layout]");
  const footer = scope.getByTestId("footer-container");
  await expect(footer).toBeVisible();
  // The tile arrives with the media connection, which can take a while
  const tile = scope.getByTestId("videoTile").first();
  await expect(tile).toBeVisible({ timeout: 60_000 });
  const tileBox = (await tile.boundingBox())!;
  const footerBox = (await footer.boundingBox())!;
  // Buttons and switches alike: the mute controls are switches
  const buttons = await footer
    .locator("button")
    .filter({ visible: true })
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("aria-label")),
    );
  return {
    layout: await call.getAttribute("data-layout"),
    tileHeight: Math.round(tileBox.height),
    footerHeight: Math.round(footerBox.height),
    buttons,
  };
}

test("looks the same in a small container as in a small window", async ({
  page,
  browser,
}) => {
  // Two calls to set up, one of them through the harness's two logins
  test.setTimeout(300_000);
  const size = { width: 300, height: 300 };

  // The reference is Element Call owning a window of that size, which is what
  // a mobile app's webview or a browser's picture-in-picture gives it, and
  // what its small-window styling was written for.
  // No permissions to grant: each browser is launched with fake media that is
  // handed out without asking (see playwright.config.ts), and Firefox rejects
  // a request for `camera` or `microphone` outright
  const referenceContext = await browser.newContext({
    viewport: size,
    ignoreHTTPSErrors: true,
  });
  const referencePage = await referenceContext.newPage();
  await referencePage.goto("/");
  await SpaHelpers.createCall(referencePage, "Reference", "smallwindow", true);
  const reference = await callShape(referencePage);
  await referencePage.screenshot({
    path: test.info().outputPath("small-window.png"),
  });

  // The component gets a container of that size, in a window that is far larger
  const { username, roomId } = await createUserAndRoom("smallcontainer");
  const panes = await startHarness(page, username, roomId);
  const pane = panes.first();
  const container = pane.getByTestId("call-container");
  await resizeContainer(container, size);
  await pane.getByTestId("lobby_joinCall").click({ timeout: 60_000 });
  await expect(pane.locator("[data-layout]")).toBeVisible({ timeout: 60_000 });
  const component = await callShape(pane);
  await container.screenshot({
    path: test.info().outputPath("small-container.png"),
  });
  await referenceContext.close();

  // The breakpoints in Element Call's stylesheets are container queries, so a
  // small container gets the compact footer a small window does, rather than
  // the full-width one the window's own size would call for
  expect(component).toEqual(reference);
  // And that footer is the compact one: a single row of controls, not the
  // full-height bar with its logo and layout switch that a large window gets
  expect(component.footerHeight).toBeLessThan(size.height / 3);
  expect(component.tileHeight + component.footerHeight).toBeLessThanOrEqual(
    size.height,
  );
});

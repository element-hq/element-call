/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, type Locator, test } from "@playwright/test";

import { SpaHelpers } from "./spa-helpers";

test("audio menu leaves participants visible while switching output", async ({
  browser,
  browserName,
}) => {
  test.skip(
    browserName === "firefox",
    "Firefox's fake media stream enumerates no audio outputs, so there is nothing to switch.",
  );

  // Reduced motion disables the animations that make these tests flaky.
  const creatorContext = await browser.newContext({ reducedMotion: "reduce" });
  const page = await creatorContext.newPage();
  await page.goto("/");
  await SpaHelpers.createCall(page, "Inviter", "Audio menu", true);
  const inviteLink = await SpaHelpers.getCallInviteLink(page);

  const guestContext = await browser.newContext({ reducedMotion: "reduce" });
  const guestPage = await guestContext.newPage();
  await SpaHelpers.joinCallFromInviteLink(guestPage, inviteLink, "Guest");

  await SpaHelpers.expectVideoTilesCount(page, 2);

  // The chevron beside the microphone button opens the audio menu in place.
  await page.getByRole("button", { name: "Microphone" }).click();
  const menu = page.getByRole("menu");
  await expect(
    menu.getByRole("heading", { name: "Audio controls" }),
  ).toBeVisible();

  // Pick another output where the browser offers one; where it does not, the
  // speaker group still names the output in use.
  const outputs = menu
    .getByTestId("audio_menu_scroll")
    .locator('> [role="menuitemradio"]');
  const count = await outputs.count();
  if (count > 1) {
    // Pinned by position: a locator on "the unchecked row" would re-resolve to
    // the previously active row once the click has moved the check mark.
    const other = outputs.nth(await firstUncheckedIndex(outputs, count));
    await other.click();
    await expect(other).toHaveAttribute("aria-checked", "true");
    await expect(menu).toBeVisible();
  } else {
    await expect(menu.getByTestId("speaker_readonly")).toBeVisible();
  }

  // Nothing covered the call: the other participant is still on screen with
  // the menu open, and after it closes.
  await SpaHelpers.expectVideoTilesCount(page, 2);
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await SpaHelpers.expectVideoTilesCount(page, 2);
});

test("level indicator moves with microphone input", async ({
  browser,
  browserName,
}) => {
  test.skip(
    browserName === "firefox",
    "Firefox has no audio backend on the CI runner, so the level stays at zero there. It passes against Firefox elsewhere, including CI's own Docker image over plain HTTP.",
  );
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  await SpaHelpers.createCall(page, "Speaker", "Level meter", true);
  await expect(page.getByTestId("videoTile")).toHaveCount(1);

  await page.getByRole("button", { name: "Microphone" }).click();
  const meter = page.getByRole("menu").getByRole("meter");
  await expect(meter).toBeVisible();

  // The browser's fake microphone plays a tone, so the meter has to leave its
  // resting level while the menu is open.
  await expect
    .poll(async () => Number(await meter.getAttribute("aria-valuenow")), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
});

async function firstUncheckedIndex(
  rows: Locator,
  count: number,
): Promise<number> {
  for (let i = 0; i < count; i++) {
    if ((await rows.nth(i).getAttribute("aria-checked")) === "false") return i;
  }
  throw new Error("every output row is marked active");
}

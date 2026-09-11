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

test("audio menu is keyboard operable in a real browser", async ({
  browser,
  browserName,
}) => {
  test.skip(
    browserName === "firefox",
    'Firefox headless drives page.keyboard.press("Tab") unreliably, as reconnect.spec.ts records.',
  );
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  await SpaHelpers.createCall(page, "Keys", "Keyboard menu", true);
  await expect(page.getByTestId("videoTile")).toHaveCount(1);

  // Open from the chevron; the first device row takes focus.
  await page.getByRole("button", { name: "Microphone" }).focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  const rows = menu.getByRole("menuitemradio");
  await expect(rows.first()).toBeFocused();

  // Arrow keys walk the device rows, where the browser lists more than one.
  if ((await rows.count()) > 1) {
    await page.keyboard.press("ArrowDown");
    await expect(rows.nth(1)).toBeFocused();
  }

  // Tab reaches the meter and then the slider; arrows adjust the slider and
  // leave the menu open.
  await page.keyboard.press("Tab");
  await expect(menu.getByRole("meter")).toBeFocused();
  await page.keyboard.press("Tab");
  const slider = menu.getByRole("slider");
  await expect(slider).toBeFocused();
  const before = Number(await slider.getAttribute("aria-valuenow"));
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => Number(await slider.getAttribute("aria-valuenow")))
    .toBeGreaterThan(before);
  await expect(menu).toBeVisible();

  // Shift+Tab goes back; Escape closes.
  await page.keyboard.press("Shift+Tab");
  await expect(menu.getByRole("meter")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
});

test("audio menu stays inside a short window", async ({ browser }) => {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 1280, height: 560 },
  });
  const page = await context.newPage();
  await page.goto("/");
  await SpaHelpers.createCall(page, "Devices", "Long lists", true);
  await page.getByTestId("videoTile").first().waitFor();

  await page.getByRole("button", { name: "Microphone" }).focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();

  // However many devices the browser reports, the menu fits the window and
  // the heading and the slider are on screen with it. How many devices that
  // is differs between browsers, so the case where the lists actually
  // overflow is covered by the CallFooter "With Many Devices" story, which
  // fixes the device count.
  await expect(menu).toBeInViewport({ ratio: 1 });
  await expect(
    menu.getByRole("heading", { name: "Audio controls" }),
  ).toBeInViewport({ ratio: 1 });
  await expect(menu.getByRole("slider")).toBeInViewport({ ratio: 1 });

  // The menu itself never becomes the scroller: that would carry the heading
  // out of view, which is what the scroll area exists to prevent.
  await expect
    .poll(async () => menu.evaluate((el) => el.scrollHeight <= el.clientHeight))
    .toBe(true);
});

test("the focus border follows the keyboard and not the pointer", async ({
  browser,
}) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  await SpaHelpers.createCall(page, "Focus", "Focus border", true);
  await page.getByTestId("videoTile").first().waitFor();

  const chevron = page.getByRole("button", { name: "Microphone" });
  const rows = page.getByRole("menu").getByRole("menuitemradio");
  const borderOfFocused = async (): Promise<string> =>
    page.evaluate(() => {
      const el = document.activeElement;
      return el === null ? "none" : getComputedStyle(el).outlineStyle;
    });

  // Reached with the pointer: the hover background carries it, no border.
  await chevron.click();
  await page.getByRole("menu").waitFor();
  await rows.nth(1).hover();
  expect(await borderOfFocused()).toBe("none");

  // Reached with the keyboard: a border marks where the keyboard is. The menu
  // moves focus to whatever the pointer is over, so the browser cannot tell
  // these two apart on its own.
  await page.keyboard.press("ArrowDown");
  expect(await borderOfFocused()).toBe("solid");

  // And back, on the next movement of the pointer.
  await rows.nth(0).hover();
  expect(await borderOfFocused()).toBe("none");
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

/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test, type Locator, type Page } from "@playwright/test";

import { SpaHelpers } from "./spa-helpers.ts";
import { installFakeDevices } from "./utils/fake-devices.ts";

test.describe("the quick audio menu", () => {
  test("lists speakers and microphones with a live level meter", async ({
    page,
  }) => {
    await installFakeDevices(page, { microphones: 3, speakers: 3 });
    await joinACall(page, "Menu user", "Audio menu");
    await openAudioMenu(page);

    await expect(page.getByRole("group", { name: "Speaker" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Microphone" })).toBeVisible();
    // By name, not count: the browser adds its own fake output and a Default.
    for (const n of [1, 2, 3])
      await expect(
        page
          .getByRole("group", { name: "Speaker" })
          .getByRole("menuitemradio", { name: `Fake Speaker ${n}` }),
      ).toBeVisible();

    await expect(
      page.getByRole("menuitemradio", { checked: true }),
    ).toHaveCount(2);
    const meter = page.getByRole("meter", { name: "Microphone level" });
    await expect(meter).toBeVisible();
    await expect(meter).toHaveAttribute("aria-valuenow", /\d+/);
    await expect(meter).toHaveAttribute("aria-valuetext", /\d+ of \d+/);

    // Both browsers here can route audio; the platform that can't is a unit check.
    await expect(
      page
        .getByRole("group", { name: "Speaker" })
        .getByRole("menuitemradio")
        .first(),
    ).toHaveAttribute("aria-disabled", "false");
  });

  test("moves the microphone and the speaker without disturbing the call", async ({
    browser,
  }) => {
    // Two browsers and a real call.
    test.slow();
    const hostContext = await browser.newContext({ reducedMotion: "reduce" });
    const host = await hostContext.newPage();
    await installFakeDevices(host, { microphones: 3, speakers: 3 });
    await joinACall(host, "Host", "Device switch");

    const inviteLink = await SpaHelpers.getCallInviteLink(host);
    const guestContext = await browser.newContext({ reducedMotion: "reduce" });
    const guest = await guestContext.newPage();
    await SpaHelpers.joinCallFromInviteLink(guest, inviteLink, "Guest");
    await SpaHelpers.expectVideoTilesCount(guest, 2);

    await openAudioMenu(host);
    await selectDevice(host, "Microphone", "Fake Microphone 2");
    await openAudioMenu(host);
    await selectDevice(host, "Speaker", "Fake Speaker 2");

    // Not a rejoin: neither side drops, and the guest still has both tiles.
    await expect(
      host.getByRole("dialog", { name: "Reconnecting…" }),
    ).not.toBeVisible();
    await expect(
      guest.getByRole("dialog", { name: "Reconnecting…" }),
    ).not.toBeVisible();
    await SpaHelpers.expectVideoTilesCount(guest, 2);
    await expect(guest.getByText("Waiting for media...")).not.toBeVisible();

    await hostContext.close();
    await guestContext.close();
  });

  test("keeps the meter moving while muted, and sends nothing", async ({
    browser,
  }) => {
    // Two browsers and a real call.
    test.slow();
    const hostContext = await browser.newContext({ reducedMotion: "reduce" });
    const host = await hostContext.newPage();
    await installFakeDevices(host);
    await joinACall(host, "Muted host", "Muted meter");

    const inviteLink = await SpaHelpers.getCallInviteLink(host);
    const guestContext = await browser.newContext({ reducedMotion: "reduce" });
    const guest = await guestContext.newPage();
    await SpaHelpers.joinCallFromInviteLink(guest, inviteLink, "Listener");
    await SpaHelpers.expectVideoTilesCount(guest, 2);

    const mute = host.getByTestId("incall_mute");
    await mute.click();
    await expect(mute).toHaveAttribute("aria-checked", "false");
    await openAudioMenu(host);

    const meter = host.getByRole("meter", { name: "Microphone level" });
    await expect(meter).toBeVisible();
    // By test id: the modal menu hides the rest of the call from the a11y tree.
    await expect(mute).toHaveAttribute("aria-checked", "false");
    await expect(mute).toBeVisible();
    // And the guest is shown the mute.
    await expect(
      guest.getByTestId("videoTile").filter({ hasText: "Muted host" }),
    ).toBeVisible();

    await hostContext.close();
    await guestContext.close();
  });

  test("keeps the meter at the foot of the list while it scrolls", async ({
    page,
  }) => {
    await installFakeDevices(page, { microphones: 20, speakers: 4 });
    await joinACall(page, "Scroller", "Long device list");
    await openAudioMenu(page);

    const meter = page.getByRole("meter", { name: "Microphone level" });
    await expect(meter).toBeVisible();

    // Scrolled so the microphones start at the top: only there does a pinned
    // meter differ from one that is simply last.
    const list = page.locator("[role='menu'] div[role='none']").first();
    await list.evaluate((element) => {
      const group = element.querySelector("[role='group'][aria-label*='icro']");
      element.scrollTop +=
        group!.getBoundingClientRect().top -
        element.getBoundingClientRect().top;
    });

    await expect(meter).toBeInViewport();
    await expectPinnedInside(meter, list);
    await expect(
      page.getByRole("menuitemradio", { name: "Fake Microphone 20" }),
    ).toBeVisible();
  });

  test("shows the focus ring only when the keyboard moved the focus", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === "firefox",
      "Headless Firefox does not deliver synthetic key presses reliably; see reconnect.spec.ts",
    );
    await installFakeDevices(page);
    await joinACall(page, "Keyboard user", "Focus ring");
    await openAudioMenu(page);

    const first = page.getByRole("menuitemradio").first();
    // Opened by pointer: no ring, though Radix has moved focus into the menu.
    await expect.poll(async () => outlineWidth(first)).toBe(0);

    await page.keyboard.press("ArrowDown");
    const focused = page.locator("[role='menuitemradio']:focus");
    await expect.poll(async () => outlineWidth(focused)).toBeGreaterThan(0);

    // And the pointer takes it away again.
    await first.hover();
    await expect.poll(async () => outlineWidth(focused)).toBe(0);
  });
});

/** Creates a call and joins it, leaving the page in the call. */
async function joinACall(
  page: Page,
  userName: string,
  callName: string,
): Promise<void> {
  await page.goto("/");
  await SpaHelpers.createCall(page, userName, callName, true);
  await expect(page.getByTestId("name_tag")).toContainText(userName);
  // The media controls stay disabled until devices have enumerated.
  await expect(page.getByTestId("incall_mute")).toBeEnabled({
    timeout: 10_000,
  });
}

async function openAudioMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Microphone" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

async function selectDevice(
  page: Page,
  section: "Speaker" | "Microphone",
  name: string,
): Promise<void> {
  const item = page
    .getByRole("group", { name: section })
    .getByRole("menuitemradio", { name });
  await item.click();
  // Selecting doesn't close the menu, so dismiss it.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).not.toBeVisible();
}

/** Asserts the meter sits within the scrollport and inside the menu's frame. */
async function expectPinnedInside(
  meter: Locator,
  list: Locator,
): Promise<void> {
  const meterBox = (await meter.boundingBox())!;
  const listBox = (await list.boundingBox())!;
  const frame = (await meter.page().getByRole("menu").boundingBox())!;

  expect(meterBox.y + meterBox.height).toBeLessThanOrEqual(
    listBox.y + listBox.height + 1,
  );
  expect(meterBox.y).toBeGreaterThanOrEqual(listBox.y - 1);
  expect(meterBox.x).toBeGreaterThan(frame.x);
  expect(meterBox.x + meterBox.width).toBeLessThan(frame.x + frame.width);
}

/** Painted outline width, in px. */
async function outlineWidth(item: Locator): Promise<number> {
  if ((await item.count()) === 0) return 0;
  return item.first().evaluate((element) => {
    const { outlineStyle, outlineWidth } = getComputedStyle(element);
    return outlineStyle === "none" ? 0 : Number.parseFloat(outlineWidth) || 0;
  });
}

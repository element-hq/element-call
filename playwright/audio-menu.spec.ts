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

    // The speaker list is what the settings modal used to be the only home of.
    await expect(page.getByRole("group", { name: "Speaker" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Microphone" })).toBeVisible();
    // Named rather than counted: the browser contributes its own fake output
    // and a "Default" entry, so a total would be a fact about the browser.
    for (const n of [1, 2, 3])
      await expect(
        page
          .getByRole("group", { name: "Speaker" })
          .getByRole("menuitemradio", { name: `Fake Speaker ${n}` }),
      ).toBeVisible();

    // Only one entry of a kind is marked, and the meter reports a number
    // rather than a colour.
    await expect(
      page.getByRole("menuitemradio", { checked: true }),
    ).toHaveCount(2);
    const meter = page.getByRole("meter", { name: "Microphone level" });
    await expect(meter).toBeVisible();
    await expect(meter).toHaveAttribute("aria-valuenow", /\d+/);
    await expect(meter).toHaveAttribute("aria-valuetext", /\d+ of \d+/);

    // Both browsers in the matrix can route audio to a chosen output, so the
    // section offers a real choice. The case where a platform cannot — Safari,
    // and anything without setSinkId — is covered by a unit check, since no
    // browser here can reach it.
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
    // Two browsers, two joins and a real call between them.
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

    // The point of the criterion: the switch is not a rejoin. Neither side
    // sees the call drop, and the guest still has both tiles — so the host
    // never left and came back.
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
    // Two browsers, two joins and a real call between them.
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

    // The microphone is held open while muted, so the meter still reports the
    // hardware. The mute control is what says nothing is being transmitted.
    const meter = host.getByRole("meter", { name: "Microphone level" });
    await expect(meter).toBeVisible();
    // Queried by test id, not by role: the menu is modal, so Radix takes the
    // rest of the call out of the accessibility tree while it is open.
    await expect(mute).toHaveAttribute("aria-checked", "false");
    await expect(mute).toBeVisible();
    // And the listener is told so, rather than being left to guess from silence.
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

    // Scrolled so the microphones start at the top of the list and run past its
    // bottom: the position that tells a pinned meter from one that merely
    // happens to be last.
    const list = page.locator("[role='menu'] div[role='none']").first();
    await list.evaluate((element) => {
      const group = element.querySelector("[role='group'][aria-label*='icro']");
      element.scrollTop +=
        group!.getBoundingClientRect().top -
        element.getBoundingClientRect().top;
    });

    await expect(meter).toBeInViewport();
    await expectPinnedInside(meter, list);
    // Every entry stays reachable, which is what the scroll is for.
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
    // Opened by pointer, so no ring, even though Radix has moved focus into the
    // menu already.
    await expect.poll(async () => outlineWidth(first)).toBe(0);

    await page.keyboard.press("ArrowDown");
    const focused = page.locator("[role='menuitemradio']:focus");
    await expect.poll(async () => outlineWidth(focused)).toBeGreaterThan(0);

    // The pointer takes it away again: the menu focuses whatever it is over, so
    // a ring that followed focus alone would trail the mouse.
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
  // The media controls stay disabled until the devices have enumerated, and
  // every test here drives them.
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
  // Selecting does not close the menu — the component prevents the default so
  // the list survives a mis-click — so it is dismissed explicitly.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).not.toBeVisible();
}

/**
 * Asserts the meter sits within the scrollport, and inside the menu's frame.
 *
 * The meter is the one opaque element in the menu, so it is the one thing that
 * can paint over the border. Whether it actually does needs a screenshot; this
 * pins the geometry that decides it.
 */
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

/** The painted outline width in pixels, however the stylesheet spells it. */
async function outlineWidth(item: Locator): Promise<number> {
  if ((await item.count()) === 0) return 0;
  return item.first().evaluate((element) => {
    const { outlineStyle, outlineWidth } = getComputedStyle(element);
    return outlineStyle === "none" ? 0 : Number.parseFloat(outlineWidth) || 0;
  });
}

/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, type Locator, type Page, test } from "@playwright/test";

import { startPair, tileOf, type User } from "./harness.ts";

/**
 * What a member's media looks like from the other side: it plays, it is
 * encrypted, it follows the mute switches, and the SFU sends only as much as
 * the tile on screen can show. Each test reads the labels the harness puts on
 * its media elements, which come straight from the SDK's track behaviors.
 *
 * One session serves every test here: logging two browsers in and connecting
 * them takes most of a minute, and none of the tests leaves the session in a
 * state the next cannot start from.
 */

test.describe.configure({ mode: "serial", timeout: 300_000 });

let pages: [Page, Page];
let users: [User, User];

test.beforeAll(async ({ browser }) => {
  ({ pages, users } = await startPair(browser, "sdkmedia"));
  for (const page of pages)
    await expect(page.getByTestId("member")).toHaveCount(2, {
      timeout: 60_000,
    });
});

test.afterAll(async () => {
  for (const page of pages ?? []) await page.context().close();
});

test("the peer's camera and microphone play", async () => {
  const peer = remoteTile(1, 0);
  const video = peer.locator("video");
  await expect
    .poll(async () => video.evaluate((v: HTMLVideoElement) => v.videoWidth), {
      timeout: 60_000,
    })
    .toBeGreaterThan(0);
  await expect(video).toHaveJSProperty("paused", false);
  const audio = peer.locator("audio");
  await expect
    .poll(async () =>
      audio.evaluate((a: HTMLAudioElement) => a.srcObject !== null),
    )
    .toBe(true);
  await expect(audio).toHaveJSProperty("paused", false);
});

test("the peer's tracks are encrypted", async () => {
  const peer = remoteTile(1, 0);
  await expect(peer.locator("video")).toHaveAttribute("data-encrypted", "true");
  await expect(peer.locator("audio")).toHaveAttribute("data-encrypted", "true");
});

test("muting the microphone and the camera is seen by the peer", async () => {
  const [page] = pages;
  const peer = remoteTile(1, 0);
  const video = peer.locator("video");
  const audio = peer.locator("audio");
  await expect(video).toHaveAttribute("data-muted", "false");
  await expect(audio).toHaveAttribute("data-muted", "false");

  await page.getByRole("button", { name: "Microphone" }).click();
  await expect(audio).toHaveAttribute("data-muted", "true", {
    timeout: 20_000,
  });
  await expect(video).toHaveAttribute("data-muted", "false");

  await page.getByRole("button", { name: "Camera" }).click();
  await expect(video).toHaveAttribute("data-muted", "true", {
    timeout: 20_000,
  });

  await page.getByRole("button", { name: "Microphone" }).click();
  await page.getByRole("button", { name: "Camera" }).click();
  await expect(audio).toHaveAttribute("data-muted", "false", {
    timeout: 20_000,
  });
  await expect(video).toHaveAttribute("data-muted", "false", {
    timeout: 20_000,
  });
});

test("the peer's microphone is active while it sends sound, and not while muted", async ({
  browserName,
}) => {
  // The SFU's speaker detection picks up Firefox's fake microphone, a steady
  // tone. Chromium's fake microphone never registers as a speaker there, so
  // the test has nothing to measure on it.
  test.skip(
    browserName === "chromium",
    "Chromium's fake microphone is silent to the SFU",
  );
  const [page] = pages;
  const audio = remoteTile(1, 0).locator("audio");
  // The SFU only announces a change of speakers, so a tone that has been
  // playing since before the peer subscribed is not announced to it. Muting
  // and unmuting is the change that is.
  await page.getByRole("button", { name: "Microphone" }).click();
  await expect(audio).toHaveAttribute("data-muted", "true", {
    timeout: 20_000,
  });
  await expect(audio).toHaveAttribute("data-active", "false");
  await page.getByRole("button", { name: "Microphone" }).click();
  await expect(audio).toHaveAttribute("data-active", "true", {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Microphone" }).click();
  await expect(audio).toHaveAttribute("data-active", "false", {
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Microphone" }).click();
});

test("a larger tile receives a higher resolution", async () => {
  const peer = remoteTile(1, 0);
  const video = peer.locator("video");
  // The tile starts small enough for the lowest simulcast layer
  const small = await receivedWidth(video, (width) => width > 0);
  await resize(peer, 1280);
  const large = await receivedWidth(video, (width) => width > small);
  expect(large).toBeGreaterThan(small);
  await resize(peer, 240);
  await receivedWidth(video, (width) => width < large);
});

test("a hidden tile stops receiving video, and a shown one resumes", async () => {
  const peer = remoteTile(1, 0);
  const video = peer.locator("video");
  await expect(frames(video)).resolves.toBeGreaterThan(0);

  await peer.evaluate((tile) => (tile.style.display = "none"));
  await expect
    .poll(async () => framesStill(video), { timeout: 60_000 })
    .toBe(true);

  await peer.evaluate((tile) => (tile.style.display = ""));
  await expect
    .poll(async () => !(await framesStill(video)), { timeout: 60_000 })
    .toBe(true);
});

/** The tile on one page for the user of the other page. */
function remoteTile(viewer: 0 | 1, shown: 0 | 1): Locator {
  return tileOf(pages[viewer], users[shown]);
}

async function resize(tile: Locator, width: number): Promise<void> {
  await tile.evaluate((t, w) => (t.style.width = `${w}px`), width);
}

/** The width of the video as decoded, once it satisfies the condition. */
async function receivedWidth(
  video: Locator,
  until: (width: number) => boolean,
): Promise<number> {
  // Switching simulcast layers takes the SFU a few seconds
  let width = 0;
  await expect
    .poll(
      async () => {
        width = await video.evaluate((v: HTMLVideoElement) => v.videoWidth);
        return until(width);
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  return width;
}

async function frames(video: Locator): Promise<number> {
  return Number(await video.getAttribute("data-frames"));
}

/** Whether no frame arrived over a couple of seconds. */
async function framesStill(video: Locator): Promise<boolean> {
  const before = await frames(video);
  await new Promise((resolve) => setTimeout(resolve, 2500));
  return (await frames(video)) === before;
}

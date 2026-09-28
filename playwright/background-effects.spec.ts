/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test, type Browser, type Page } from "@playwright/test";

import { SpaHelpers } from "./spa-helpers.ts";
import {
  averageColour,
  cameraColour,
  type Colour,
  distance,
} from "./utils/colour.ts";

// Background effects need WebGL2, and headless Firefox on a CI runner has none,
// so it rightly offers none of them.
test.skip(
  ({ browserName }) => browserName === "firefox",
  "Background effects need WebGL2, which headless Firefox on CI does not have",
);

test.describe("background effects", () => {
  test("pre-join preview shows the chosen effect", async ({ page }) => {
    test.slow();
    await page.goto("/");
    await SpaHelpers.createCall(page, "Effect user", "Background effects");
    const preview = page.locator("video").first();
    const camera = await cameraColour(preview);

    await page.getByRole("button", { name: "Camera", exact: true }).click();
    const tile = page
      .getByRole("group", { name: "Background effects" })
      .getByRole("menuitemradio", { name: "Background 1" });
    await tile.click();
    await expect(tile).toHaveAttribute("aria-checked", "true");

    // The fake camera shows no person, so the whole frame is background: the
    // preview takes on the picture's colours and leaves the camera's.
    const picture = await averageColour(tile.locator("img"));
    // Long enough for the first effect of a session to be built.
    await expect
      .poll(async () => distance(await averageColour(preview), picture), {
        timeout: 60_000,
      })
      .toBeLessThan(distance(camera, picture) / 2);
  });
});

test.describe("no effect", () => {
  test("draws nothing, even after blurring", async ({ page }) => {
    test.setTimeout(120_000);
    await countDraws(page);
    await page.goto("/");
    await SpaHelpers.createCall(page, "Idle user", "No effect after blur");

    await page.getByRole("button", { name: "Camera", exact: true }).click();
    const effects = page.getByRole("group", { name: "Background effects" });
    await effects.getByRole("menuitemradio", { name: "Blur" }).click();
    // Long enough for the first effect of a session to be built.
    await expect
      .poll(async () => drawsPerSecond(page), { timeout: 60_000 })
      .toBeGreaterThan(0);
    const blurred = await drawsPerSecond(page);

    await effects.getByRole("menuitemradio", { name: "None" }).click();
    // A frame already on its way may still be drawn.
    await expect.poll(async () => drawsPerSecond(page)).toBe(0);
    test.info().annotations.push({
      type: "WebGL draws per second",
      description: `blurred ${blurred}, none 0`,
    });
  });
});

/** Counts every WebGL draw on the page, the segmenter's and the effect's. */
async function countDraws(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const counter = { draws: 0 };
    (window as unknown as { webglDraws: typeof counter }).webglDraws = counter;
    for (const name of ["drawArrays", "drawElements"] as const) {
      const draw = WebGL2RenderingContext.prototype[name] as (
        ...args: unknown[]
      ) => void;
      WebGL2RenderingContext.prototype[name] = function (
        this: WebGL2RenderingContext,
        ...args: unknown[]
      ): void {
        counter.draws += 1;
        draw.apply(this, args);
      } as never;
    }
  });
}

/** WebGL draws over the next second. */
async function drawsPerSecond(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const counter = (window as unknown as { webglDraws: { draws: number } })
      .webglDraws;
    const before = counter.draws;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return counter.draws - before;
  });
}

test.describe("background effects section", () => {
  test("section stays within the call area at every size", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await SpaHelpers.createCall(page, "Sizes user", "Background effect sizes");

    for (const size of [
      { width: 1280, height: 800 },
      { width: 800, height: 600 },
      { width: 600, height: 420 },
      { width: 480, height: 360 },
      { width: 360, height: 640 },
    ]) {
      await page.setViewportSize(size);
      await page.getByRole("button", { name: "Camera", exact: true }).click();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();

      const box = (await menu.boundingBox())!;
      const where = `at ${size.width}x${size.height}`;
      expect(box.x, where).toBeGreaterThanOrEqual(0);
      expect(box.y, where).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, where).toBeLessThanOrEqual(size.width);
      expect(box.y + box.height, where).toBeLessThanOrEqual(size.height);

      const last = page
        .getByRole("group", { name: "Background effects" })
        .getByRole("menuitemradio")
        .last();
      await last.scrollIntoViewIfNeeded();
      await expect(last, where).toBeInViewport({ ratio: 1 });
      await last.click();
      await expect(last, where).toHaveAttribute("aria-checked", "true");

      // Back to no effect for the next size, and close.
      await page
        .getByRole("group", { name: "Background effects" })
        .getByRole("menuitemradio", { name: "None" })
        .click();
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
    }
  });
});

test.describe("the chosen effect", () => {
  test("chosen effect survives leaving and rejoining", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await SpaHelpers.createCall(page, "Returning user", "Effect remembered");
    const { camera, picture } = await chooseAndWear(page, "Background 1");
    await page.getByTestId("lobby_joinCall").click();
    await page.getByTestId("incall_leave").click();
    await expect(page.getByRole("heading")).toContainText(
      "your call has ended",
    );

    await page.goto("/");
    await page.getByTestId("home_callName").fill("Effect remembered again");
    await page.getByTestId("home_go").click();
    await expect(page.getByTestId("lobby_joinCall")).toBeVisible();
    await page.getByRole("button", { name: "Camera", exact: true }).click();
    const tile = page
      .getByRole("group", { name: "Background effects" })
      .getByRole("menuitemradio", { name: "Background 1" });
    await expect(tile).toHaveAttribute("aria-checked", "true");
    const preview = page.locator("video").first();
    await expect
      .poll(async () => distance(await averageColour(preview), picture), {
        timeout: 60_000,
      })
      .toBeLessThan(distance(camera, picture) / 2);
  });

  test("second session still shows the existing error", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await SpaHelpers.createCall(page, "Two tabs", "Effect in two tabs");
    await chooseAndWear(page, "Background 1");

    const second = await page.context().newPage();
    await second.goto("/");
    await expect(
      page.getByRole("heading", { name: "Opened in another tab" }),
    ).toBeVisible();
  });
});

/** Chooses an effect in the lobby, and waits until the preview wears it. */
async function chooseAndWear(
  page: Page,
  name: string,
): Promise<{ camera: Colour; picture: Colour }> {
  const preview = page.locator("video").first();
  const camera = await cameraColour(preview);
  await page.getByRole("button", { name: "Camera", exact: true }).click();
  const tile = page.getByRole("menuitemradio", { name });
  await tile.click();
  const picture = await averageColour(tile.locator("img"));
  await expect
    .poll(async () => distance(await averageColour(preview), picture), {
      timeout: 60_000,
    })
    .toBeLessThan(distance(camera, picture) / 2);
  await page.keyboard.press("Escape");
  return { camera, picture };
}

test.describe("joining with a background chosen", () => {
  test("publishes no frame of the room", async ({ browser }) => {
    // Two first builds of the pipeline, one of them held back.
    test.setTimeout(180_000);
    const hostContext = await browser.newContext();
    const host = await hostContext.newPage();
    await recordIncomingFrames(host);
    await host.goto("/");
    await SpaHelpers.createCall(host, "Host", "Join with a background", true);
    await expect(host.getByTestId("incall_videomute")).toBeEnabled({
      timeout: 10_000,
    });
    const inviteLink = await SpaHelpers.getCallInviteLink(host);
    await host.keyboard.press("Escape");

    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    await guest.goto(inviteLink);
    await guest.getByTestId("joincall_displayName").fill("Guest");
    await guest.getByTestId("joincall_joincall").click();
    const preview = guest.locator("video").first();
    await expect(preview).toBeVisible();
    const camera = await cameraColour(preview);
    await guest.getByRole("button", { name: "Camera", exact: true }).click();
    const tile = guest.getByRole("menuitemradio", { name: "Background 1" });
    await tile.click();
    const picture = await averageColour(tile.locator("img"));
    await expect
      .poll(async () => distance(await averageColour(preview), picture), {
        timeout: 60_000,
      })
      .toBeLessThan(distance(camera, picture) / 2);
    // A pipeline built again for the call's track now takes as long as it
    // does on the slower route. Routing bypasses the cache, so it waits.
    let heldBack = 0;
    await guest.route("**/*.tflite*", async (route) => {
      heldBack += 1;
      await new Promise((resolve) => setTimeout(resolve, 15_000));
      await route.continue();
    });
    await guest.keyboard.press("Escape");
    await guest.getByTestId("lobby_joinCall").click();

    const guestTile = host
      .getByTestId("videoTile")
      .filter({ has: host.getByTestId("name_tag").getByText("Guest") });
    await expect(guestTile.locator("video")).toBeVisible({ timeout: 60_000 });
    // Visible can come before the stream is attached.
    let trackId: string | undefined;
    await expect
      .poll(async () => {
        trackId = await guestTile
          .locator("video")
          .evaluate(
            (video: HTMLVideoElement) =>
              (video.srcObject as MediaStream | null)?.getVideoTracks()[0]?.id,
          );
        return trackId;
      })
      .toBeDefined();
    await expectNoFrameOfTheRoom(host, trackId!, 0, camera, picture);
    // Otherwise nothing was waited for.
    expect(heldBack).toBeGreaterThan(0);

    await hostContext.close();
    await guestContext.close();
  });
});

test.describe("the first build", () => {
  test("survives the camera turned off and on while it runs", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const failures: string[] = [];
    page.on("console", (m) => {
      if (m.text().includes("Failed to attach video processor"))
        failures.push(m.text());
    });
    await page.goto("/");
    await SpaHelpers.createCall(page, "Toggling user", "Toggle while building");
    const preview = page.locator("video").first();
    const camera = await cameraColour(preview);

    const held = await holdBackTheModel(page);
    await page.getByRole("button", { name: "Camera", exact: true }).click();
    const tile = page.getByRole("menuitemradio", { name: "Background 1" });
    await tile.click();
    const picture = await averageColour(tile.locator("img"));
    await page.keyboard.press("Escape");
    // New preview tracks, each attached while the first is still building.
    for (let i = 0; i < 2; i++) {
      await page.getByTestId("incall_videomute").click();
      await page.getByTestId("incall_videomute").click();
    }

    await expect
      .poll(async () => distance(await averageColour(preview), picture), {
        timeout: 60_000,
      })
      .toBeLessThan(distance(camera, picture) / 2);
    expect(failures).toEqual([]);
    expect(held()).toBeGreaterThan(0);
  });
});

test.describe("turning the camera on with a background chosen", () => {
  test("publishes no frame of the room when the camera started off", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const { host, guest, close } = await hostAndGuest(browser);
    const camera = await cameraColour(guest.locator("video").first());
    await guest.getByTestId("incall_videomute").click();
    await guest.getByTestId("lobby_joinCall").click();

    const picture = await chooseBackground(guest);
    const held = await holdBackTheModel(guest);
    await guest.getByTestId("incall_videomute").click();

    const trackId = await incomingTrackId(host);
    await expectNoFrameOfTheRoom(host, trackId, 0, camera, picture);
    expect(held()).toBeGreaterThan(0);
    await close();
  });

  test("publishes no frame of the room when the camera was turned off", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const { host, guest, close } = await hostAndGuest(browser);
    const camera = await cameraColour(guest.locator("video").first());
    await guest.getByTestId("lobby_joinCall").click();
    const trackId = await incomingTrackId(host);
    await expect
      .poll(async () => (await framesOf(host, trackId)).length, {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);
    await guest.getByTestId("incall_videomute").click();

    const picture = await chooseBackground(guest);
    const held = await holdBackTheModel(guest);
    const before = (await framesOf(host, trackId)).length;
    await guest.getByTestId("incall_videomute").click();

    await expectNoFrameOfTheRoom(host, trackId, before, camera, picture);
    expect(held()).toBeGreaterThan(0);
    await close();
  });
});

/** A host in a call, recording what it receives, and a guest in its lobby. */
async function hostAndGuest(browser: Browser): Promise<{
  host: Page;
  guest: Page;
  close: () => Promise<void>;
}> {
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await recordIncomingFrames(host);
  await host.goto("/");
  await SpaHelpers.createCall(host, "Host", "Camera with a background", true);
  await expect(host.getByTestId("incall_videomute")).toBeEnabled({
    timeout: 10_000,
  });
  const inviteLink = await SpaHelpers.getCallInviteLink(host);
  await host.keyboard.press("Escape");

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(inviteLink);
  await guest.getByTestId("joincall_displayName").fill("Guest");
  await guest.getByTestId("joincall_joincall").click();
  await expect(guest.locator("video").first()).toBeVisible();
  return {
    host,
    guest,
    close: async (): Promise<void> => {
      await hostContext.close();
      await guestContext.close();
    },
  };
}

/** Chooses the first shipped picture in the call, and answers its colour. */
async function chooseBackground(guest: Page): Promise<Colour> {
  // The lobby has a camera button of its own, so wait for the call's.
  await expect(guest.getByTestId("incall_leave")).toBeVisible({
    timeout: 30_000,
  });
  await expect(guest.getByTestId("incall_videomute")).toBeEnabled({
    timeout: 10_000,
  });
  await guest.getByRole("button", { name: "Camera", exact: true }).click();
  const tile = guest.getByRole("menuitemradio", { name: "Background 1" });
  await tile.click();
  await expect(tile).toHaveAttribute("aria-checked", "true");
  const picture = await averageColour(tile.locator("img"));
  await guest.keyboard.press("Escape");
  return picture;
}

/** Makes the pipeline's first build as slow as on the slower route. */
/** Answers how often it held the model back, which a check should see. */
async function holdBackTheModel(page: Page): Promise<() => number> {
  let held = 0;
  // Routing bypasses the cache, so it waits.
  await page.route("**/*.tflite*", async (route) => {
    held += 1;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    await route.continue();
  });
  return () => held;
}

/** The id of the guest's camera track, as the host receives it. */
async function incomingTrackId(host: Page): Promise<string> {
  const guestTile = host
    .getByTestId("videoTile")
    .filter({ has: host.getByTestId("name_tag").getByText("Guest") });
  await expect(guestTile.locator("video")).toBeVisible({ timeout: 60_000 });
  // Visible can come before the stream is attached.
  let trackId: string | undefined;
  await expect
    .poll(async () => {
      trackId = await guestTile
        .locator("video")
        .evaluate(
          (video: HTMLVideoElement) =>
            (video.srcObject as MediaStream | null)?.getVideoTracks()[0]?.id,
        );
      return trackId;
    })
    .toBeDefined();
  return trackId!;
}

/** Waits for the picture to arrive, then finds no frame of the room since. */
async function expectNoFrameOfTheRoom(
  host: Page,
  trackId: string,
  since: number,
  camera: Colour,
  picture: Colour,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const frames = (await framesOf(host, trackId)).slice(since);
        // A black frame, as a track starts, is nearer the picture than the
        // camera, but shows neither.
        return frames.some(
          (f) =>
            distance(f, picture) <
            Math.min(distance(f, camera), distance(f, [0, 0, 0])),
        );
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  const frames = (await framesOf(host, trackId)).slice(since);
  expect(
    frames.filter((f) => distance(f, camera) < distance(f, picture)),
  ).toEqual([]);
}

/**
 * Records the mean colour of every frame of every video track the page
 * receives, from the moment it arrives: a tile may attach it later than its
 * first frame.
 */
async function recordIncomingFrames(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const frames: Record<string, [number, number, number][]> = {};
    (window as unknown as { receivedFrames: typeof frames }).receivedFrames =
      frames;
    const record = (track: MediaStreamTrack): void => {
      if (track.kind !== "video" || frames[track.id]) return;
      const seen: [number, number, number][] = (frames[track.id] = []);
      const video = document.createElement("video");
      video.muted = true;
      video.srcObject = new MediaStream([track]);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 16;
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      const step = (): void => {
        context.drawImage(video, 0, 0, 16, 16);
        const { data } = context.getImageData(0, 0, 16, 16);
        const sum = [0, 0, 0];
        for (let i = 0; i < data.length; i += 4)
          for (let c = 0; c < 3; c++) sum[c] += data[i + c];
        seen.push(sum.map((v) => v / (data.length / 4)) as Colour);
        video.requestVideoFrameCallback(step);
      };
      video.requestVideoFrameCallback(step);
      void video.play();
    };
    const Connection = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends Connection {
      public constructor(...args: ConstructorParameters<typeof Connection>) {
        super(...args);
        this.addEventListener("track", (e) => record(e.track));
      }
    };
  });
}

async function framesOf(page: Page, trackId: string): Promise<Colour[]> {
  return page.evaluate(
    (id) =>
      (
        window as unknown as {
          receivedFrames: Record<string, [number, number, number][]>;
        }
      ).receivedFrames[id] ?? [],
    trackId,
  );
}

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

test.describe("the camera menu's preview", () => {
  test("shows the camera with the effect in force", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await SpaHelpers.createCall(page, "Preview user", "Preview in the menu");
    const camera = await cameraColour(page.locator("video").first());

    await page.getByRole("button", { name: "Camera", exact: true }).click();
    const preview = page.getByRole("menu").locator("video");
    await expect(preview).toBeVisible();
    await expect
      .poll(async () => distance(await averageColour(preview), camera), {
        timeout: 20_000,
      })
      .toBeLessThan(30);

    const tile = page.getByRole("menuitemradio", { name: "Background 1" });
    await tile.click();
    const picture = await averageColour(tile.locator("img"));
    await expect
      .poll(async () => distance(await averageColour(preview), picture), {
        timeout: 60_000,
      })
      .toBeLessThan(distance(camera, picture) / 2);
  });
});

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

test.describe("a pipeline that fails to build", () => {
  test("offers no effects for the session, and keeps the choice", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await SpaHelpers.createCall(page, "Failing user", "Pipeline fails");
    const preview = page.locator("video").first();
    const camera = await cameraColour(preview);
    await page.route("**/*.tflite*", async (route) => route.abort());

    await page.getByRole("button", { name: "Camera", exact: true }).click();
    const tile = page.getByRole("menuitemradio", { name: "Background 1" });
    await tile.click();
    await expect(
      page.getByText("Background effects are not supported on this platform."),
    ).toBeVisible({ timeout: 30_000 });
    await expect(tile).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");
    // The camera and microphone carry on without it.
    expect(distance(await cameraColour(preview), camera)).toBeLessThan(30);
    await expect(page.getByTestId("incall_mute")).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await page.unroute("**/*.tflite*");
    await page.reload();
    await expect(page.getByTestId("lobby_joinCall")).toBeVisible();
    await page.getByRole("button", { name: "Camera", exact: true }).click();
    await expect(tile).toHaveAttribute("aria-checked", "true");
    const picture = await averageColour(tile.locator("img"));
    await expect
      .poll(async () => distance(await averageColour(preview), picture), {
        timeout: 60_000,
      })
      .toBeLessThan(distance(camera, picture) / 2);
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

test.describe("a background of one's own", () => {
  test("adds an image from the device", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await SpaHelpers.createCall(page, "Adding user", "Own background");
    const preview = page.locator("video").first();
    const camera = await cameraColour(preview);
    const red = await redImage(page);

    await addImage(page, red);
    const mine = page
      .getByRole("group", { name: "Background effects" })
      .getByRole("menuitemradio", { name: "Background 3" });
    await expect(mine).toBeVisible();
    await expect(mine).toHaveAttribute("aria-checked", "false");

    await mine.click();
    await expect
      .poll(async () => distance(await averageColour(preview), RED), {
        timeout: 60_000,
      })
      .toBeLessThan(distance(camera, RED) / 2);
  });

  test("adding an image makes no upload", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await SpaHelpers.createCall(page, "Private user", "Own background kept");
    const preview = page.locator("video").first();
    const camera = await cameraColour(preview);
    const red = await redImage(page);
    const sent: { request: string; body: Buffer | null }[] = [];
    page.on("request", (request) =>
      sent.push({
        request: `${request.method()} ${request.url()}`,
        body: request.postDataBuffer(),
      }),
    );

    await addImage(page, red);
    await page
      .getByRole("group", { name: "Background effects" })
      .getByRole("menuitemradio", { name: "Background 3" })
      .click();
    // Kept, chosen and in force: anything that would send it has had its turn.
    await expect
      .poll(async () => distance(await averageColour(preview), RED), {
        timeout: 60_000,
      })
      .toBeLessThan(distance(camera, RED) / 2);
    // The file as given, and the copy kept, which is encoded anew.
    const samples = [red, await keptBytes(page)].map((bytes) =>
      bytes.subarray(bytes.length - 64),
    );
    const carriesIt = sent.filter(
      ({ request, body }) =>
        request.includes("/_matrix/media/") ||
        samples.some((sample) => body?.includes(sample)),
    );
    expect(carriesIt.map(({ request }) => request)).toEqual([]);
  });

  test("added image survives rejoining and is gone after storage is cleared", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await SpaHelpers.createCall(page, "Keeping user", "Own background again");
    const preview = page.locator("video").first();
    const camera = await cameraColour(preview);
    const red = await redImage(page);
    await addImage(page, red);
    const mine = page
      .getByRole("group", { name: "Background effects" })
      .getByRole("menuitemradio", { name: "Background 3" });
    await mine.click();
    await page.keyboard.press("Escape");

    await page.reload();
    await expect(page.getByTestId("lobby_joinCall")).toBeVisible();
    await page.getByRole("button", { name: "Camera", exact: true }).click();
    await expect(mine).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    await expect
      .poll(async () => distance(await averageColour(preview), RED), {
        timeout: 60_000,
      })
      .toBeLessThan(distance(camera, RED) / 2);

    await page.evaluate(
      async () =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase(
            "element-call-background-images",
          );
          request.onsuccess = (): void => resolve();
          request.onerror = (): void => reject(request.error);
          request.onblocked = (): void => resolve();
        }),
    );
    await page.reload();
    await expect(page.getByTestId("lobby_joinCall")).toBeVisible();
    await page.getByRole("button", { name: "Camera", exact: true }).click();
    await expect(
      page.getByRole("group", { name: "Background effects" }),
    ).toBeVisible();
    await expect(mine).toHaveCount(0);
    await page.keyboard.press("Escape");

    await addImage(page, red);
    await expect(mine).toBeVisible();
  });

  test("a removed image stays removed", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await SpaHelpers.createCall(
      page,
      "Removing user",
      "Own background removed",
    );
    await addImage(page, await redImage(page));
    const mine = page
      .getByRole("group", { name: "Background effects" })
      .getByRole("menuitemradio", { name: "Background 3" });
    await expect(mine).toHaveAttribute("aria-keyshortcuts", "Delete");
    await mine.focus();
    await page.keyboard.press("Delete");
    await expect(mine).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId("lobby_joinCall")).toBeVisible();
    await page.getByRole("button", { name: "Camera", exact: true }).click();
    await expect(
      page.getByRole("group", { name: "Background effects" }),
    ).toBeVisible();
    await expect(mine).toHaveCount(0);
    expect(await keptImages(page)).toEqual([]);
  });
});

test.describe("what can be added", () => {
  test("refuses an animated image", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await SpaHelpers.createCall(page, "Refused user", "Animated refused");
    await addImage(page, ANIMATED_GIF, {
      name: "moving.gif",
      type: "image/gif",
    });

    await expect(
      page.getByText("Animated images cannot be used as a background"),
    ).toBeVisible();
    const section = page.getByRole("group", { name: "Background effects" });
    await expect(
      section.getByRole("menuitemradio", { name: "Background 3" }),
    ).toHaveCount(0);
    await expect(
      section.getByRole("menuitemradio", { name: "None" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(await keptImages(page)).toEqual([]);
  });

  test("reduces an oversized image", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await SpaHelpers.createCall(page, "Large user", "Oversized reduced");
    await addImage(page, await pngImage(page, { width: 4000, height: 3000 }));

    await expect(
      page
        .getByRole("group", { name: "Background effects" })
        .getByRole("menuitemradio", { name: "Background 3" }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    const [kept] = await keptImages(page);
    expect(kept).toMatchObject({ width: 1920, height: 1440 });
  });

  test("lays every image on an opaque ground", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await SpaHelpers.createCall(page, "Logo user", "Transparent made opaque");
    await addImage(
      page,
      await pngImage(page, { width: 320, height: 180, transparent: true }),
    );

    await expect(
      page
        .getByRole("group", { name: "Background effects" })
        .getByRole("menuitemradio", { name: "Background 3" }),
    ).toBeVisible();
    const [kept] = await keptImages(page);
    expect(kept.minAlpha).toBe(255);
  });
});

/** Two frames of one pixel, red then blue. */
const ANIMATED_GIF = Buffer.from(
  "R0lGODlhAQABAPEAAP8AAAAA/wAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQACgAAACwAAAAAAQABAAACAkQBACH5BAAKAAAALAAAAAABAAEAAAICTAEAOw==",
  "base64",
);

/** A red PNG of the given size; transparent leaves its right half empty. */
async function pngImage(
  page: Page,
  size: { width: number; height: number; transparent?: boolean },
): Promise<Buffer> {
  const dataUrl = await page.evaluate(({ width, height, transparent }) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "rgb(255, 0, 0)";
    context.fillRect(0, 0, transparent ? width / 2 : width, height);
    return canvas.toDataURL("image/png");
  }, size);
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

/** The images the device keeps, as it keeps them. */
async function keptImages(
  page: Page,
): Promise<{ width: number; height: number; minAlpha: number }[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("element-call-background-images");
      request.onsuccess = (): void => resolve(request.result);
      request.onerror = (): void => reject(request.error);
    });
    if (!db.objectStoreNames.contains("backgrounds")) return [];
    const kept = await new Promise<{ image: Blob }[]>((resolve, reject) => {
      const request = db
        .transaction("backgrounds")
        .objectStore("backgrounds")
        .getAll();
      request.onsuccess = (): void => resolve(request.result);
      request.onerror = (): void => reject(request.error);
    });
    db.close();
    return Promise.all(
      kept.map(async ({ image }) => {
        const bitmap = await createImageBitmap(image);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d")!;
        context.drawImage(bitmap, 0, 0);
        const { data } = context.getImageData(
          0,
          0,
          bitmap.width,
          bitmap.height,
        );
        let minAlpha = 255;
        for (let i = 3; i < data.length; i += 4)
          minAlpha = Math.min(minAlpha, data[i]);
        return { width: bitmap.width, height: bitmap.height, minAlpha };
      }),
    );
  });
}

/** The bytes of the one image the device keeps. */
async function keptBytes(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(
    async () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open("element-call-background-images");
        open.onerror = (): void => reject(open.error);
        open.onsuccess = (): void => {
          const all = open.result
            .transaction("backgrounds")
            .objectStore("backgrounds")
            .getAll();
          all.onerror = (): void => reject(all.error);
          all.onsuccess = (): void => {
            const reader = new FileReader();
            reader.onload = (): void =>
              resolve((reader.result as string).split(",")[1]);
            reader.readAsDataURL((all.result[0] as { image: Blob }).image);
          };
        };
      }),
  );
  return Buffer.from(base64, "base64");
}

const RED: Colour = [255, 0, 0];

/** A solid red PNG, unlike the camera and the shipped pictures. */
async function redImage(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "rgb(255, 0, 0)";
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  });
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

/** Adds an image from the camera menu's add tile, leaving the menu open. */
async function addImage(
  page: Page,
  image: Buffer,
  { name, type } = { name: "mine.png", type: "image/png" },
): Promise<void> {
  if (!(await page.getByRole("menu").isVisible()))
    await page.getByRole("button", { name: "Camera", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Add image" }).click();
  await (await chooser).setFiles({ name, mimeType: type, buffer: image });
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

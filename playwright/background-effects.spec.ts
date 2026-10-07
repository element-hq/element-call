/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test, type Locator, type Page } from "@playwright/test";

import { SpaHelpers } from "./spa-helpers.ts";

// Background effects need WebGL2, and headless Firefox on a CI runner has none,
// so it rightly offers none of them.
test.skip(
  ({ browserName }) => browserName === "firefox",
  "Background effects need WebGL2, which headless Firefox on CI does not have",
);

type Colour = [number, number, number];

test.describe("background effects", () => {
  test("pre-join preview shows the chosen effect", async ({ page }) => {
    test.slow();
    await page.goto("/");
    await SpaHelpers.createCall(page, "Effect user", "Background effects");
    const preview = page.locator("video").first();
    const camera = await averageColour(preview);

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

/** The mean colour of a video's current frame or an image, drawn small. */
async function averageColour(element: Locator): Promise<Colour> {
  return element.evaluate(
    async (source: HTMLVideoElement | HTMLImageElement) => {
      if (source instanceof HTMLImageElement) await source.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 32;
      const context = canvas.getContext("2d")!;
      context.drawImage(source, 0, 0, 32, 32);
      const { data } = context.getImageData(0, 0, 32, 32);
      const sum = [0, 0, 0];
      for (let i = 0; i < data.length; i += 4)
        for (let c = 0; c < 3; c++) sum[c] += data[i + c];
      const pixels = data.length / 4;
      return sum.map((s) => s / pixels) as Colour;
    },
  );
}

function distance(a: Colour, b: Colour): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

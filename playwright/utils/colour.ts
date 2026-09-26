/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, type Locator } from "@playwright/test";

export type Colour = [number, number, number];

/** The camera's colour, once the preview is showing it rather than nothing. */
export async function cameraColour(preview: Locator): Promise<Colour> {
  await expect
    .poll(async () => Math.max(...(await averageColour(preview))))
    .toBeGreaterThan(40);
  return averageColour(preview);
}

/** The mean colour of a video's current frame or an image, drawn small. */
export async function averageColour(element: Locator): Promise<Colour> {
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

export function distance(a: Colour, b: Colour): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Waits until a preview shows a picture rather than the camera. */
export async function expectWearing(
  preview: Locator,
  picture: Colour,
  camera: Colour,
): Promise<void> {
  // Long enough for the first effect of a session to be built.
  await expect
    .poll(async () => distance(await averageColour(preview), picture), {
      timeout: 60_000,
    })
    .toBeLessThan(distance(camera, picture) / 2);
}

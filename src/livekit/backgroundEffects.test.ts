/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import {
  type BackgroundEffect,
  imagePathFor,
  parseEffect,
  serializeEffect,
  shippedBackgrounds,
} from "./backgroundEffects";

describe("the chosen background effect", () => {
  test("round-trips through its stored form", () => {
    const effects: BackgroundEffect[] = [
      { kind: "none" },
      { kind: "blur" },
      ...shippedBackgrounds.map(({ id }) => ({ kind: "shipped" as const, id })),
      { kind: "added", id: "d3b07384" },
    ];
    for (const effect of effects)
      expect(parseEffect(serializeEffect(effect))).toEqual(effect);
  });

  test("falls back to no effect when the stored form names nothing we ship", () => {
    expect(parseEffect("image:gone")).toEqual({ kind: "none" });
    expect(parseEffect("")).toEqual({ kind: "none" });
    expect(parseEffect("added:")).toEqual({ kind: "none" });
  });

  test("reads a stored value that is not a string as no effect", () => {
    for (const raw of [null, 1, {}, ["blur"]])
      expect(parseEffect(raw)).toEqual({ kind: "none" });
  });

  test("gives every shipped background an image to draw", () => {
    for (const { id } of shippedBackgrounds)
      expect(imagePathFor(id)).toBeTruthy();
  });

  // A background has to cover what is behind it: JPEG has no alpha channel.
  test("ships only opaque backgrounds", async () => {
    for (const { imagePath } of shippedBackgrounds) {
      const name = imagePath.split("/").pop()!.split("?")[0];
      const bytes = await readFile(`src/graphics/${name}`);
      expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xff, 0xd8, 0xff]);
    }
  });
});

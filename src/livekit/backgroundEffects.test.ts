/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { maxAddedBackgrounds } from "./backgroundImages";
import { describe, expect, test } from "vitest";

import {
  parseEffect,
  serializeEffect,
  shippedBackgrounds,
  imagePathFor,
} from "./backgroundEffects";

describe("the chosen background effect", () => {
  test("round-trips through its stored form", () => {
    for (const effect of [
      { kind: "none" } as const,
      { kind: "blur" } as const,
      { kind: "shipped", id: shippedBackgrounds[0].id } as const,
      { kind: "added", id: "a-uuid" } as const,
    ])
      expect(parseEffect(serializeEffect(effect))).toEqual(effect);
  });

  test("falls back to no effect when the stored form names nothing we ship", () => {
    // A background removed between releases, or a value from a future one.
    expect(parseEffect("image:a-background-we-no-longer-ship")).toEqual({
      kind: "none",
    });
    expect(parseEffect("")).toEqual({ kind: "none" });
  });

  // The regression this guards is not hypothetical: the first stand-ins were
  // the app's own overlay gradients, which have no opaque pixel in them at all,
  // so as backgrounds their dark half was simply missing.
  test("ships only opaque backgrounds", async () => {
    const { readFile } = await import("node:fs/promises");
    for (const background of shippedBackgrounds) {
      const name = background.imagePath.split("/").pop()!.split("?")[0];
      const bytes = await readFile(`src/graphics/${name}`);
      // JPEG, which has no alpha channel to carry a hole in.
      expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xff, 0xd8, 0xff]);
    }
  });

  // Three to a row, and the add tile goes at the limit. At four of their own
  // the grid stopped at eight and left its last corner empty; the rule is that
  // it is whole both at the limit and one short of it, with the add tile.
  test("fills the grid at the limit and one short of it", () => {
    const fixed = 2 + shippedBackgrounds.length; // no effect, blur, shipped
    expect((fixed + maxAddedBackgrounds) % 3).toBe(0);
    expect((fixed + maxAddedBackgrounds - 1 + 1) % 3).toBe(0);
  });

  test("gives every shipped background an image to draw", () => {
    for (const background of shippedBackgrounds)
      expect(imagePathFor(background.id)).toBeTruthy();
  });
});

describe("the blur control in settings", () => {
  // The control is a checkbox over a setting that holds more than two states,
  // so what it shows and what it writes are both derived. This is that
  // derivation, which is what keeps it from disagreeing with the camera menu.
  const shows = (stored: string): boolean =>
    parseEffect(stored).kind === "blur";
  const writes = (on: boolean): string =>
    serializeEffect(on ? { kind: "blur" } : { kind: "none" });

  test("reads as off while an image background is in force", () => {
    expect(shows(serializeEffect({ kind: "shipped", id: "indoor" }))).toBe(
      false,
    );
    expect(shows(serializeEffect({ kind: "added", id: "a-uuid" }))).toBe(false);
  });

  test("reads as on while blur is in force", () => {
    expect(shows("blur")).toBe(true);
  });

  test("replaces an image background when it is turned on", () => {
    expect(writes(true)).toBe("blur");
  });

  test("leaves no effect behind when it is turned off", () => {
    expect(writes(false)).toBe("none");
  });
});

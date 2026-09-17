/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

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
    expect(shows(serializeEffect({ kind: "shipped", id: "indoor" }))).toBe(false);
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

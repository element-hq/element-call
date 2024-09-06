/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "vitest";

import { Initializer } from "../src/initializer";

test("initBeforeReact sets font family from URL param", () => {
  window.location.hash = "#?font=DejaVu Sans";
  Initializer.initBeforeReact();
  expect(
    getComputedStyle(document.documentElement).getPropertyValue(
      "--font-family",
    ),
  ).toBe('"DejaVu Sans"');
});

test("initBeforeReact sets font scale from URL param", () => {
  window.location.hash = "#?fontScale=1.2";
  Initializer.initBeforeReact();
  expect(
    getComputedStyle(document.documentElement).getPropertyValue("--font-scale"),
  ).toBe("1.2");
});

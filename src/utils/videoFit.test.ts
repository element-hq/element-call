/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test } from "vitest";

import { autoVideoFit } from "./videoFit";

describe("videoFit$ defaults", () => {
  test.each([
    {
      videoAspectRatio: 1920 / 1080,
      tileAspectRatio: NaN,
    },
    {
      videoAspectRatio: 1080 / 1920,
      tileAspectRatio: NaN,
    },
    {
      videoAspectRatio: NaN,
      tileAspectRatio: 1920 / 1080,
    },
    {
      videoAspectRatio: NaN,
      tileAspectRatio: 1080 / 1920,
    },
  ])(
    "videoFit$ returns `cover` when videoAspectRatio is $videoAspectRatio and tileAspectRatio is $tileAspectRatio",
    ({ videoAspectRatio, tileAspectRatio }) =>
      expect(autoVideoFit(videoAspectRatio, tileAspectRatio)).toBe("cover"),
  );
});

const VIDEO_480_L = 640 / 480;
const VIDEO_720_L = 1280 / 720;
const VIDEO_1080_L = 1920 / 1080;

// Some sizes from real world testing, which don't match the standard video sizes exactly
const TILE_SIZE_1_L = 180 / 135;
const TILE_SIZE_3_P = 379 / 542;
const TILE_SIZE_4_L = 957 / 542;
// This is the size of an iPhone Xr in portrait mode
const TILE_SIZE_5_P = 414 / 896;

function inverse(ratio: number): number {
  return 1 / ratio;
}

test.each([
  {
    videoAspectRatio: VIDEO_480_L,
    tileAspectRatio: TILE_SIZE_1_L,
    expected: "cover",
  },
  {
    videoAspectRatio: inverse(VIDEO_480_L),
    tileAspectRatio: TILE_SIZE_1_L,
    expected: "contain",
  },
  {
    videoAspectRatio: VIDEO_720_L,
    tileAspectRatio: TILE_SIZE_4_L,
    expected: "cover",
  },
  {
    videoAspectRatio: inverse(VIDEO_720_L),
    tileAspectRatio: TILE_SIZE_4_L,
    expected: "contain",
  },
  {
    videoAspectRatio: inverse(VIDEO_1080_L),
    tileAspectRatio: TILE_SIZE_3_P,
    expected: "cover",
  },
  {
    videoAspectRatio: VIDEO_1080_L,
    tileAspectRatio: TILE_SIZE_5_P,
    expected: "contain",
  },
  {
    videoAspectRatio: inverse(VIDEO_1080_L),
    tileAspectRatio: TILE_SIZE_5_P,
    expected: "cover",
  },
  {
    // square video
    videoAspectRatio: 400 / 400,
    tileAspectRatio: VIDEO_480_L,
    expected: "contain",
  },
  {
    // Should default to cover if the initial size is 0:0.
    // Or else it will cause a flash of "contain" mode until the real size is loaded, which can be jarring.
    videoAspectRatio: VIDEO_480_L,
    tileAspectRatio: 0 / 0,
    expected: "cover",
  },
  {
    videoAspectRatio: 0 / 0,
    tileAspectRatio: VIDEO_480_L,
    expected: "cover",
  },
])(
  "videoFit$ returns $expected when videoAspectRatio is $videoAspectRatio and tileAspectRatio is $tileAspectRatio",
  ({ videoAspectRatio, tileAspectRatio, expected }) =>
    expect(autoVideoFit(videoAspectRatio, tileAspectRatio)).toBe(expected),
);

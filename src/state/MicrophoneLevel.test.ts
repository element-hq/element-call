/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test } from "vitest";

import { METER_SEGMENTS, segmentsForVolume } from "./MicrophoneLevel";

describe("segmentsForVolume", () => {
  test("shows nothing for silence", () => {
    expect(segmentsForVolume(0)).toBe(0);
  });

  test("shows nothing for the hiss of a quiet room", () => {
    // Without a noise floor these light the first segments permanently, which
    // reads as "it can hear me" when nobody is speaking.
    expect(segmentsForVolume(0.005)).toBe(0);
    expect(segmentsForVolume(0.015)).toBe(0);
  });

  test("distinguishes quiet, normal and loud speech", () => {
    const quiet = segmentsForVolume(0.06);
    const normal = segmentsForVolume(0.2);
    const loud = segmentsForVolume(0.8);

    expect(quiet).toBeGreaterThan(0);
    expect(normal).toBeGreaterThan(quiet);
    expect(loud).toBeGreaterThan(normal);
  });

  test("moves the meter visibly for normal speech", () => {
    // Ordinary speech should reach the middle of the meter, not scrape along
    // the floor: a meter that barely moves reads as a broken microphone.
    expect(segmentsForVolume(0.2)).toBeGreaterThanOrEqual(METER_SEGMENTS / 4);
  });

  test("never exceeds the meter", () => {
    expect(segmentsForVolume(1)).toBe(METER_SEGMENTS);
    expect(segmentsForVolume(4)).toBe(METER_SEGMENTS);
  });

  test("treats a missing reading as silence", () => {
    expect(segmentsForVolume(NaN)).toBe(0);
    expect(segmentsForVolume(-1)).toBe(0);
  });
});

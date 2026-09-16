/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test } from "vitest";

import {
  ATTACK_MS,
  METER_SEGMENTS,
  RELEASE_MS,
  segmentsForVolume,
  smoothVolume,
} from "./MicrophoneLevel";

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

describe("smoothVolume", () => {
  test("rises faster than it falls", () => {
    const rise = smoothVolume(0, 1, 50);
    const fall = 1 - smoothVolume(1, 0, 50);

    expect(rise).toBeGreaterThan(fall);
  });

  test("registers a syllable as it starts", () => {
    // Most of the way there within one attack time constant, so speech does
    // not lag the speaker.
    expect(smoothVolume(0, 1, ATTACK_MS)).toBeGreaterThan(0.6);
  });

  test("rides over the gaps between words", () => {
    // A pause of a few tens of milliseconds should not collapse the meter, or
    // it flickers rather than reading as a level.
    expect(smoothVolume(1, 0, 30)).toBeGreaterThan(0.7);
    // A real silence still brings it down.
    expect(smoothVolume(1, 0, RELEASE_MS * 3)).toBeLessThan(0.1);
  });

  test("behaves the same whatever the frame rate", () => {
    const oneStep = smoothVolume(0, 1, 32);
    let twoSteps = smoothVolume(0, 1, 16);
    twoSteps = smoothVolume(twoSteps, 1, 16);

    expect(twoSteps).toBeCloseTo(oneStep, 5);
  });

  test("holds still when no time has passed", () => {
    expect(smoothVolume(0.5, 1, 0)).toBe(0.5);
  });
});

/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, test, vi } from "vitest";

import {
  ATTACK_MS,
  METER_SEGMENTS,
  observeMicrophoneState$,
  RELEASE_MS,
  segmentsForVolume,
  smoothVolume,
} from "./MicrophoneLevel";
import { restoreAudioCapture, stubAudioCapture } from "../utils/test";

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

describe("observeMicrophoneState$", () => {
  afterEach(restoreAudioCapture);

  test("releases a capture the browser grants after nobody is watching", async () => {
    const capture = stubAudioCapture();

    const subscription = observeMicrophoneState$("mic1").subscribe();
    // The user gives up on the permission prompt and closes the menu, and only
    // then does the browser hand the microphone over.
    subscription.unsubscribe();
    capture.grant();
    await vi.waitFor(() => expect(capture.track.stop).toHaveBeenCalled());
  });

  test("releases the capture and the audio context when the subscription ends", async () => {
    const capture = stubAudioCapture();

    const subscription = observeMicrophoneState$("mic1").subscribe();
    capture.grant();
    await vi.waitFor(() => expect(capture.contexts).toHaveLength(1));

    subscription.unsubscribe();

    expect(capture.track.stop).toHaveBeenCalled();
    expect(capture.contexts[0].close).toHaveBeenCalled();
  });

  test("tells denied permission and a missing device apart", async () => {
    for (const [name, expected] of [
      ["NotAllowedError", "permission-denied"],
      ["NotFoundError", "no-device"],
    ] as const) {
      const capture = stubAudioCapture();
      capture.getUserMedia.mockRejectedValue(named(new Error(name), name));

      const seen: string[] = [];
      const subscription = observeMicrophoneState$("mic1").subscribe((state) =>
        seen.push(state.type),
      );
      await vi.waitFor(() => expect(seen).toContain(expected));
      subscription.unsubscribe();
      restoreAudioCapture();
    }
  });

  test("says nothing on a frame that did not change the level", async () => {
    const capture = stubAudioCapture();

    let emissions = 0;
    const subscription = observeMicrophoneState$("mic1").subscribe(
      () => emissions++,
    );
    capture.grant();
    await vi.waitFor(() => expect(emissions).toBe(1));

    // The analyser is read every animation frame, but the meter has only
    // METER_SEGMENTS steps: a steady signal must not redraw the meter.
    capture.drawFrames(20);
    expect(emissions).toBe(1);

    subscription.unsubscribe();
  });
});

/** An error with the `name` the browser would give it, not just a message. */
function named(error: Error, name: string): Error {
  error.name = name;
  return error;
}

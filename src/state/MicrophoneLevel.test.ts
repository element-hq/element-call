/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, test, vi } from "vitest";

import {
  ATTACK_MS,
  LEVEL_SCALE,
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
    // Ordinary speech reaches the middle of the meter.
    expect(segmentsForVolume(0.2)).toBeGreaterThanOrEqual(LEVEL_SCALE / 4);
  });

  test("never exceeds the meter", () => {
    expect(segmentsForVolume(1)).toBe(LEVEL_SCALE);
    expect(segmentsForVolume(4)).toBe(LEVEL_SCALE);
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
    // Most of the way within one attack time constant.
    expect(smoothVolume(0, 1, ATTACK_MS)).toBeGreaterThan(0.6);
  });

  test("rides over the gaps between words", () => {
    // A short pause doesn't collapse the meter...
    expect(smoothVolume(1, 0, 30)).toBeGreaterThan(0.7);
    // ...but a real silence brings it down.
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
    // The menu closes before the browser hands the microphone over.
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

  test("gives the microphone back when the audio graph fails to build", async () => {
    const capture = stubAudioCapture();
    // Fails only after getUserMedia has granted the device.
    vi.stubGlobal(
      "AudioContext",
      class {
        public constructor() {
          throw new Error("no audio context for you");
        }
      },
    );

    const seen: string[] = [];
    const subscription = observeMicrophoneState$("mic1").subscribe((state) =>
      seen.push(state.type),
    );
    capture.grant();

    await vi.waitFor(() => expect(seen).toContain("no-device"));
    expect(capture.track.stop).toHaveBeenCalled();

    subscription.unsubscribe();
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

    // Read every frame, but a steady signal emits once.
    capture.drawFrames(20);
    expect(emissions).toBe(1);

    subscription.unsubscribe();
  });
});

/** An error carrying the browser's `name`. */
function named(error: Error, name: string): Error {
  error.name = name;
  return error;
}

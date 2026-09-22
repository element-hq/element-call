/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { distinctUntilChanged, Observable } from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";

/**
 * What the microphone selector can say about the input, beyond its level.
 *
 * Silence and a broken microphone look identical on a meter, so the states a
 * user has to act on are named rather than drawn as a flat bar.
 */
export type MicrophoneState =
  | { type: "level"; level: number }
  | { type: "permission-denied" }
  | { type: "no-device" };

/**
 * The scale a level is reported on: 0 means silence, this means full scale.
 *
 * Fixed, and deliberately not the number of bars drawn — that follows the
 * width available. A scale that moved with the width would announce the same
 * loudness as different numbers in different places, and would make this layer
 * depend on how wide something is drawn.
 */
export const LEVEL_SCALE = 24;

/**
 * Observes what a microphone is picking up, as the meter should show it.
 *
 * - Held for exactly as long as something is watching: subscribing opens the
 *   device, unsubscribing releases it. The menu, not the call.
 * - Its own capture rather than the track the call holds, by design. The
 *   pre-join screen freezes that track to the device selected when it mounted,
 *   so a meter fed from it could not follow the picker.
 * - Says whether the microphone hears anything, not whether anyone hears the
 *   user: it keeps reading while muted, and the mute control carries that.
 */
export function observeMicrophoneState$(
  deviceId: string | undefined,
): Observable<MicrophoneState> {
  return new Observable<MicrophoneState>((subscriber) => {
    let stream: MediaStream | undefined;
    let context: AudioContext | undefined;
    let frame: number | undefined;

    // Safe to call more than once: unsubscribing runs it, and `start` runs it
    // again for anything the browser handed over after that.
    const release = (): void => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close();
      frame = undefined;
      stream = undefined;
      context = undefined;
    };

    const start = async (): Promise<void> => {
      stream = await navigator.mediaDevices.getUserMedia({
        audio:
          deviceId === undefined ? true : { deviceId: { exact: deviceId } },
      });
      // A permission prompt outlives the subscription that asked for it, so by
      // now nobody may be watching — and `release` ran while `stream` was still
      // undefined. Nothing will call it again, so release here or the device
      // stays held, with the indicator lit and no meter on screen.
      if (subscriber.closed) return release();

      context = new AudioContext();
      // Chrome starts the context suspended unless it was created during a
      // gesture; opening the menu is one, but resume explicitly so the meter
      // cannot silently sit at zero.
      if (context.state === "suspended") await context.resume();
      if (subscriber.closed) return release();

      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      let displayed = 0;
      let previousFrame = performance.now();

      const read = (): void => {
        analyser.getByteTimeDomainData(samples);
        // Root mean square of the waveform around its centre, which is the
        // loudness a listener perceives rather than the tallest spike.
        let sum = 0;
        for (const sample of samples) {
          const centred = (sample - 128) / 128;
          sum += centred * centred;
        }
        const now = performance.now();
        displayed = smoothVolume(
          displayed,
          Math.sqrt(sum / samples.length),
          now - previousFrame,
        );
        previousFrame = now;
        subscriber.next({ type: "level", level: segmentsForVolume(displayed) });
        frame = requestAnimationFrame(read);
      };
      read();
    };

    start().catch((e: unknown) => {
      // Building the graph can fail after getUserMedia has already resolved,
      // and the capture would then outlive its own failure: the microphone
      // open and its in-use light on, behind a meter reporting it as
      // unavailable. Releasing is its own step, which teardown and this path
      // both take.
      release();
      subscriber.next(stateForFailure(e));
    });

    return release;
  }).pipe(
    // Read every animation frame, but quantised to a whole number of segments,
    // so most frames say nothing new and should not reach React.
    distinctUntilChanged(
      (a, b) =>
        a.type === b.type &&
        (a.type !== "level" || b.type !== "level" || a.level === b.level),
    ),
  );
}

/** What a failure to open the microphone means for the person using it. */
function stateForFailure(e: unknown): MicrophoneState {
  const name = e instanceof Error ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return { type: "permission-denied" };
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return { type: "no-device" };
  logger.error("Could not read the microphone level", e);
  return { type: "no-device" };
}

/**
 * Loudness below which the microphone counts as hearing nothing. A quiet room
 * is never digitally silent, and without a floor that hiss lights the first
 * bars permanently — which reads as "it can hear me" when nobody is speaking.
 */
const NOISE_FLOOR = 0.02;

/**
 * Quantises a 0..1 volume onto {@link LEVEL_SCALE}. Exported for the tests:
 * this mapping is what decides whether quiet, normal and loud look different.
 */
export function segmentsForVolume(volume: number): number {
  if (!Number.isFinite(volume) || volume <= NOISE_FLOOR) return 0;
  // Volume arrives as amplitude, where speech occupies a small part of the top
  // of the range. A square root spreads that out, so ordinary speech moves the
  // meter through its middle rather than barely leaving the floor.
  const aboveFloor = (Math.min(volume, 1) - NOISE_FLOOR) / (1 - NOISE_FLOOR);
  return Math.min(LEVEL_SCALE, Math.ceil(Math.sqrt(aboveFloor) * LEVEL_SCALE));
}

/** Time constant for a rise. Short, so a syllable registers as it starts. */
export const ATTACK_MS = 50;

/**
 * Time constant for a fall. Longer than the attack: speech is full of gaps a
 * few tens of milliseconds long, and tracking them exactly would flicker.
 */
export const RELEASE_MS = 120;

/**
 * Moves a displayed level towards a new reading, fast up and slowly down.
 *
 * In elapsed time rather than frames, so it behaves the same at 60Hz and
 * 120Hz, and does not jump when a frame is dropped.
 */
export function smoothVolume(
  displayed: number,
  reading: number,
  elapsedMs: number,
): number {
  if (elapsedMs <= 0) return displayed;
  const timeConstant = reading > displayed ? ATTACK_MS : RELEASE_MS;
  const towards = 1 - Math.exp(-elapsedMs / timeConstant);
  return displayed + (reading - displayed) * towards;
}

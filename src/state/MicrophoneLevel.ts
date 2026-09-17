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
 * Steps the meter is drawn in. The level is quantised to these.
 *
 * Enough of them that they sit close together across the width of the menu:
 * the bars keep a fixed size, so too few leaves visible gaps between them.
 */
export const METER_SEGMENTS = 24;

/**
 * Observes what a microphone is picking up, as the meter should show it.
 *
 * Subscribing opens the device and unsubscribing releases it, so it is held for
 * exactly as long as something is watching — the menu, and not the call.
 *
 * Opens a capture of its own rather than reading the track the call already
 * holds. That is a shortcut, recorded as S1 in the feature spec: the pre-join
 * screen freezes its audio track to the device selected when it mounted, so a
 * meter fed from that track could not follow the picker.
 *
 * The level says whether the microphone is picking anything up, which is not
 * the same as whether the user is being heard: it keeps reading while muted,
 * and the mute control is what says nothing is transmitted.
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

    start().catch((e: unknown) => subscriber.next(stateForFailure(e)));

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
 * Loudness below which the microphone is treated as picking up nothing.
 *
 * A quiet room is never digitally silent, and without a floor that hiss lights
 * the first segments permanently — which reads as "it can hear me" when nobody
 * is speaking.
 */
const NOISE_FLOOR = 0.02;

/**
 * Quantises a 0..1 volume to a whole number of meter segments.
 *
 * Exported for the tests: the mapping from loudness to segments is the part
 * that decides whether quiet, normal and loud speech look different.
 */
export function segmentsForVolume(volume: number): number {
  if (!Number.isFinite(volume) || volume <= NOISE_FLOOR) return 0;
  // Volume arrives as amplitude, where speech occupies a small part of the top
  // of the range. A square root spreads that out, so ordinary speech moves the
  // meter through its middle rather than barely leaving the floor.
  const aboveFloor = (Math.min(volume, 1) - NOISE_FLOOR) / (1 - NOISE_FLOOR);
  return Math.min(
    METER_SEGMENTS,
    Math.ceil(Math.sqrt(aboveFloor) * METER_SEGMENTS),
  );
}

/**
 * How quickly the meter follows a rise in loudness, as a time constant in
 * milliseconds. Short, so a syllable registers the moment it starts.
 */
export const ATTACK_MS = 50;

/**
 * How quickly the meter follows a fall. Longer than the attack: speech is full
 * of gaps a few tens of milliseconds long, and a meter that tracked them
 * exactly would flicker rather than read as a level.
 */
export const RELEASE_MS = 120;

/**
 * Moves a displayed level towards a new reading, fast upwards and slowly
 * downwards.
 *
 * Framed in elapsed time rather than frames, so the meter behaves the same on a
 * 60Hz and a 120Hz display, and does not jump when a frame is dropped.
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

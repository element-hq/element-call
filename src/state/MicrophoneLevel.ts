/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BehaviorSubject, Observable } from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";

import { type Behavior } from "./Behavior";

/** What the microphone picks up, or why it can't be read. */
export type MicrophoneState =
  // A Behavior, so a changing level can be drawn without re-rendering.
  | { type: "level"; level: Behavior<number> }
  | { type: "permission-denied" }
  | { type: "no-device" };

/** Scale a level is reported on. Fixed rather than the bar count, so a level reads the same at any width. */
export const LEVEL_SCALE = 24;

/**
 * The level of a microphone, captured while subscribed. Its own capture rather
 * than the call's track, because pre-join freezes that track to the device
 * selected at mount.
 */
export function observeMicrophoneState$(
  deviceId: string | undefined,
): Observable<MicrophoneState> {
  return new Observable<MicrophoneState>((subscriber) => {
    let stream: MediaStream | undefined;
    let context: AudioContext | undefined;
    let frame: number | undefined;
    let level: BehaviorSubject<number> | undefined;

    // Idempotent: teardown and start can both call it.
    const release = (): void => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close();
      frame = undefined;
      stream = undefined;
      context = undefined;
      level?.complete();
      level = undefined;
    };

    const start = async (): Promise<void> => {
      stream = await navigator.mediaDevices.getUserMedia({
        audio:
          deviceId === undefined ? true : { deviceId: { exact: deviceId } },
      });
      // Unsubscribed while the permission prompt was open.
      if (subscriber.closed) return release();

      context = new AudioContext();
      // Starts suspended outside a user gesture, which would read as silence.
      if (context.state === "suspended") await context.resume();
      if (subscriber.closed) return release();

      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      let displayed = 0;
      let previousFrame = performance.now();
      const current = new BehaviorSubject(0);
      level = current;
      subscriber.next({ type: "level", level: current });

      const read = (): void => {
        analyser.getByteTimeDomainData(samples);
        // RMS: perceived loudness rather than the peak.
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
        // Frames that don't move the quantised level say nothing.
        const next = segmentsForVolume(displayed);
        if (next !== current.value) current.next(next);
        frame = requestAnimationFrame(read);
      };
      read();
    };

    start().catch((e: unknown) => {
      // Building the graph can fail after the device was granted.
      release();
      subscriber.next(stateForFailure(e));
    });

    return release;
  });
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

/** Below this counts as silence, so a quiet room's hiss doesn't light the first bars. */
const NOISE_FLOOR = 0.02;

/** Quantises a 0..1 volume onto {@link LEVEL_SCALE}. */
export function segmentsForVolume(volume: number): number {
  if (!Number.isFinite(volume) || volume <= NOISE_FLOOR) return 0;
  // Square root, so ordinary speech reaches the middle of the scale.
  const aboveFloor = (Math.min(volume, 1) - NOISE_FLOOR) / (1 - NOISE_FLOOR);
  return Math.min(LEVEL_SCALE, Math.ceil(Math.sqrt(aboveFloor) * LEVEL_SCALE));
}

/** Rise time constant: short, so a syllable registers as it starts. */
export const ATTACK_MS = 50;

/** Fall time constant: longer, so the gaps between words don't flicker. */
export const RELEASE_MS = 120;

/** Eases towards a reading, by elapsed time so the frame rate doesn't matter. */
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

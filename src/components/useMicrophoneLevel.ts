/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect, useState } from "react";
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";

/**
 * The state of the microphone level indicator.
 *
 * `inactive` is the resting state: nothing is being captured, because nothing
 * has asked for a level yet. `absent` means there is no microphone to capture
 * from, which is not the same as one that hears nothing. `active` means we
 * hold a capture and `level` is the current signal level in the range 0..1.
 * `denied` and `unavailable` are the two failure modes we distinguish, because
 * they need different UI: the first is recoverable by the user, the second is
 * not.
 */
export type MicrophoneLevelState =
  | { type: "inactive" }
  | { type: "absent" }
  | { type: "active"; level: number }
  | { type: "denied" }
  | { type: "unavailable" };

/** Signal at or below this many dBFS reads as silence. */
const FLOOR_DB = -60;

/**
 * Smoothing applied to the displayed level. Rises are followed almost
 * immediately so speech registers at once; falls are eased so the bars do not
 * flicker between syllables.
 */
const ATTACK = 0.5;
const RELEASE = 0.12;

/**
 * Observes the signal level of a microphone, for as long as `enabled` holds.
 *
 * The capture is owned by this hook and is torn down whenever `enabled` goes
 * false, the device changes, or the component unmounts, including when any of
 * those happen while the capture is still being acquired. Nothing outlives the
 * caller.
 *
 * @param deviceId - The microphone to observe, or undefined if none is selected.
 * @param enabled - Whether to hold a capture at all.
 * @param steps - How many levels the caller can tell apart. The level is
 *   rounded to one of them, and movement within a step reports nothing new.
 */
export function useMicrophoneLevel(
  deviceId: string | undefined,
  enabled: boolean,
  steps: number,
): MicrophoneLevelState {
  const [state, setState] = useState<MicrophoneLevelState>({
    type: "inactive",
  });

  useEffect(() => {
    if (!enabled) {
      setState({ type: "inactive" });
      return;
    }
    if (deviceId === undefined) {
      setState({ type: "absent" });
      return;
    }
    // Insecure contexts have no media devices at all; nothing can be metered.
    if (!("mediaDevices" in navigator)) {
      setState({ type: "unavailable" });
      return;
    }

    // Guards every asynchronous continuation below: the effect can be cleaned
    // up while getUserMedia is still in flight, and the stream it eventually
    // resolves with must be stopped rather than left running.
    let disposed = false;
    let stream: MediaStream | undefined;
    let context: AudioContext | undefined;
    let frame: number | undefined;

    /** Gives back whatever has been acquired so far. */
    const release = (): void => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
      // close() rejects if the context is already closed, which is possible if
      // the browser tore it down with the page.
      context?.close().catch(() => {});
      stream = undefined;
      context = undefined;
      frame = undefined;
    };

    const dispose = (): void => {
      disposed = true;
      release();
    };

    navigator.mediaDevices
      .getUserMedia({ audio: { deviceId: { exact: deviceId } } })
      .then((acquired) => {
        if (disposed) {
          acquired.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = acquired;
        context = new AudioContext();
        // Firefox starts a context suspended unless the page has user
        // activation, and a suspended context feeds the analyser silence
        // rather than the microphone. Resuming one that already runs is a
        // no-op.
        void context.resume().catch(() => {});
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        context.createMediaStreamSource(acquired).connect(analyser);
        const samples = new Float32Array(analyser.fftSize);

        let smoothed = 0;
        const tick = (): void => {
          if (disposed) return;
          analyser.getFloatTimeDomainData(samples);
          const level = amplitudeToLevel(rms(samples));
          smoothed +=
            (level - smoothed) * (level > smoothed ? ATTACK : RELEASE);
          // Keep the last value when the level has not moved a whole step:
          // a frame that would redraw the same picture must not re-render
          // anything. Silence therefore costs nothing at all, since the level
          // rests at zero.
          const stepped = Math.round(smoothed * steps) / steps;
          setState((previous) =>
            previous.type === "active" && previous.level === stepped
              ? previous
              : { type: "active", level: stepped },
          );
          frame = requestAnimationFrame(tick);
        };
        setState({ type: "active", level: 0 });
        frame = requestAnimationFrame(tick);
      })
      .catch((e: unknown) => {
        if (disposed) return;
        // The microphone may already be open: building the audio graph can
        // fail after getUserMedia has resolved, and the capture would then
        // outlive its own failure, holding the microphone-in-use indicator on
        // behind a meter that says the microphone is unavailable.
        release();
        rootLogger
          .getChild("[useMicrophoneLevel]")
          .warn("Could not open microphone for level metering", e);
        setState(classifyError(e));
      });

    return dispose;
  }, [deviceId, enabled, steps]);

  return state;
}

/** Root mean square of a block of samples, as a linear amplitude. */
function rms(samples: Float32Array): number {
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.sqrt(sum / samples.length);
}

/** Maps a linear amplitude onto 0..1 over a fixed dBFS window. */
function amplitudeToLevel(amplitude: number): number {
  if (amplitude <= 0) return 0;
  const db = 20 * Math.log10(amplitude);
  if (db <= FLOOR_DB) return 0;
  return Math.min(1, db / -FLOOR_DB + 1);
}

function classifyError(e: unknown): MicrophoneLevelState {
  const name = e instanceof Error ? e.name : "";
  // NotAllowedError is the modern name; SecurityError is what older WebKit
  // raises for the same situation.
  if (name === "NotAllowedError" || name === "SecurityError")
    return { type: "denied" };
  return { type: "unavailable" };
}

/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect, useState } from "react";
import { logger } from "matrix-js-sdk/lib/logger";

import {
  type MicrophoneState,
  segmentsForVolume,
} from "../state/MicrophoneLevel";

/**
 * Reads the live input level of a microphone, while `active`.
 *
 * Capture is scoped to the caller being on screen: the meter only exists while
 * the menu that shows it is open, so nothing holds a second capture of the
 * device for the length of a call.
 *
 * The level says whether the microphone is picking anything up, which is not
 * the same as whether the user is being heard. It keeps moving while muted, and
 * the mute control is what says nothing is transmitted.
 */
export function useMicrophoneLevel(
  deviceId: string | undefined,
  active: boolean,
): MicrophoneState {
  const [state, setState] = useState<MicrophoneState>({
    type: "level",
    level: 0,
  });

  useEffect(() => {
    if (!active) return;

    let stopped = false;
    let stream: MediaStream | undefined;
    let context: AudioContext | undefined;
    let frame: number | undefined;

    const stop = (): void => {
      stopped = true;
      if (frame !== undefined) cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close();
    };

    const start = async (): Promise<void> => {
      stream = await navigator.mediaDevices.getUserMedia({
        audio:
          deviceId === undefined ? true : { deviceId: { exact: deviceId } },
      });
      if (stopped) return;

      context = new AudioContext();
      // Chrome starts the context suspended unless it was created during a
      // gesture; opening the menu is one, but resume explicitly so the meter
      // cannot silently sit at zero.
      if (context.state === "suspended") await context.resume();
      if (stopped) return;
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);

      const read = (): void => {
        analyser.getByteTimeDomainData(samples);
        // Root mean square of the waveform around its centre, which is the
        // loudness a listener perceives rather than the tallest spike.
        let sum = 0;
        for (const sample of samples) {
          const centred = (sample - 128) / 128;
          sum += centred * centred;
        }
        const level = segmentsForVolume(Math.sqrt(sum / samples.length));
        setState((current) =>
          current.type === "level" && current.level === level
            ? current
            : { type: "level", level },
        );
        frame = requestAnimationFrame(read);
      };
      read();
    };

    start().catch((e: unknown) => {
      const name = e instanceof Error ? e.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setState({ type: "permission-denied" });
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setState({ type: "no-device" });
      } else {
        logger.error("Could not read the microphone level", e);
        setState({ type: "no-device" });
      }
    });

    return stop;
  }, [deviceId, active]);

  return state;
}

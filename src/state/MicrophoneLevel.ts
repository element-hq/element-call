/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

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
export const METER_SEGMENTS = 32;

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

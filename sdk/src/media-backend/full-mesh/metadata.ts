/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The track and consumption metadata of the full mesh transport (MSC4575),
 * and their validation: both come from the other member and are untrusted.
 * Both are keyed by the `mid` of a track's transceiver.
 */

/**
 * The data channel every publisher connection has for `sendData`, and its
 * protocol: one JSON object `{ topic, text }` per message.
 */
export const DATA_CHANNEL_LABEL = "io.element.matrixrtc.data";
export const DATA_PROTOCOL = "io.element.matrixrtc.topic_text";

export type MediaPurpose = "m.usermedia" | "m.screenshare";

export interface TrackMetadataEntry {
  purpose: string;
  muted?: boolean;
}
export type TrackMetadata = Record<string, TrackMetadataEntry>;

export interface ConsumptionMetadataEntry {
  in_use?: boolean;
  max_width?: number;
  max_height?: number;
}
export type ConsumptionMetadata = Record<string, ConsumptionMetadataEntry>;

/** Larger than any video we capture; a bound on what a subscriber can ask for. */
const MAX_DIMENSION = 16_384;
/** More tracks than any member publishes; a bound on the work a message causes. */
const MAX_TRACKS = 64;

export function isMediaPurpose(purpose: string): purpose is MediaPurpose {
  return purpose === "m.usermedia" || purpose === "m.screenshare";
}

/** The entries of `value` that are well formed, or null if it isn't metadata at all. */
export function parseTrackMetadata(value: unknown): TrackMetadata | null {
  const entries = recordEntries(value);
  if (entries === null) return null;
  const metadata: TrackMetadata = {};
  for (const [mid, e] of entries) {
    if (typeof e.purpose !== "string") continue;
    const entry: TrackMetadataEntry = { purpose: e.purpose };
    if (typeof e.muted === "boolean") entry.muted = e.muted;
    metadata[mid] = entry;
  }
  return metadata;
}

/** As `parseTrackMetadata`, with the sizes bounded to what makes sense. */
export function parseConsumptionMetadata(
  value: unknown,
): ConsumptionMetadata | null {
  const entries = recordEntries(value);
  if (entries === null) return null;
  const metadata: ConsumptionMetadata = {};
  for (const [mid, e] of entries) {
    const entry: ConsumptionMetadataEntry = {};
    if (typeof e.in_use === "boolean") entry.in_use = e.in_use;
    const width = bounded(e.max_width);
    if (width !== undefined) entry.max_width = width;
    const height = bounded(e.max_height);
    if (height !== undefined) entry.max_height = height;
    metadata[mid] = entry;
  }
  return metadata;
}

function recordEntries(
  value: unknown,
): [string, Record<string, unknown>][] | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  return Object.entries(value)
    .filter(
      (e): e is [string, Record<string, unknown>] =>
        typeof e[1] === "object" && e[1] !== null && !Array.isArray(e[1]),
    )
    .slice(0, MAX_TRACKS);
}

function bounded(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(Math.min(value, MAX_DIMENSION))
    : undefined;
}

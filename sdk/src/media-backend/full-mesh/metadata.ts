/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The stream and consumption metadata of the full mesh transport (MSCXXXX),
 * and their validation: both come from the other member and are untrusted.
 */

export const DATA_PURPOSE = "org.matrix.mscXXXX.data";
/**
 * The data stream every publisher connection has for `sendData`, and its
 * protocol: one JSON object `{ topic, text }` per message.
 */
export const DATA_STREAM_ID = "io.element.matrixrtc.data";
export const DATA_PROTOCOL = "io.element.matrixrtc.topic_text";

export type MediaPurpose = "m.usermedia" | "m.screenshare";

export interface StreamMetadataEntry {
  purpose: string;
  audio_muted?: boolean;
  video_muted?: boolean;
  /** Only for data streams. */
  protocol?: string;
}
/** By stream id: the `msid` of a media stream, the label of a data stream. */
export type StreamMetadata = Record<string, StreamMetadataEntry>;

export interface ConsumptionMetadataEntry {
  in_use?: boolean;
  max_width?: number;
  max_height?: number;
  max_framerate?: number;
}
/** By stream id, as in the stream metadata. */
export type ConsumptionMetadata = Record<string, ConsumptionMetadataEntry>;

/** Larger than any video we capture; a bound on what a subscriber can ask for. */
const MAX_DIMENSION = 16_384;
const MAX_FRAMERATE = 240;
/** More streams than any member publishes; a bound on the work a message causes. */
const MAX_STREAMS = 64;

export function isMediaPurpose(purpose: string): purpose is MediaPurpose {
  return purpose === "m.usermedia" || purpose === "m.screenshare";
}

/** The entries of `value` that are well formed, or null if it isn't metadata at all. */
export function parseStreamMetadata(value: unknown): StreamMetadata | null {
  const entries = recordEntries(value);
  if (entries === null) return null;
  const metadata: StreamMetadata = {};
  for (const [id, e] of entries) {
    if (typeof e.purpose !== "string") continue;
    const entry: StreamMetadataEntry = { purpose: e.purpose };
    if (typeof e.audio_muted === "boolean") entry.audio_muted = e.audio_muted;
    if (typeof e.video_muted === "boolean") entry.video_muted = e.video_muted;
    if (typeof e.protocol === "string") entry.protocol = e.protocol;
    if (e.purpose === DATA_PURPOSE && entry.protocol === undefined) continue;
    metadata[id] = entry;
  }
  return metadata;
}

/** As `parseStreamMetadata`, with the hints bounded to what makes sense. */
export function parseConsumptionMetadata(
  value: unknown,
): ConsumptionMetadata | null {
  const entries = recordEntries(value);
  if (entries === null) return null;
  const metadata: ConsumptionMetadata = {};
  for (const [id, e] of entries) {
    const entry: ConsumptionMetadataEntry = {};
    if (typeof e.in_use === "boolean") entry.in_use = e.in_use;
    const width = bounded(e.max_width, MAX_DIMENSION);
    if (width !== undefined) entry.max_width = Math.round(width);
    const height = bounded(e.max_height, MAX_DIMENSION);
    if (height !== undefined) entry.max_height = Math.round(height);
    const framerate = bounded(e.max_framerate, MAX_FRAMERATE);
    if (framerate !== undefined) entry.max_framerate = framerate;
    metadata[id] = entry;
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
    .slice(0, MAX_STREAMS);
}

function bounded(value: unknown, max: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(value, max)
    : undefined;
}

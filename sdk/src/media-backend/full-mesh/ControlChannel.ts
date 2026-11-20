/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The control channel of a full mesh connection (MSC4575): a negotiated data
 * channel both sides create, which carries every message of the connection
 * once it is open, apart from `close`.
 */

import {
  type ConsumptionMetadata,
  parseConsumptionMetadata,
  parseTrackMetadata,
  type TrackMetadata,
} from "./metadata";

export const CONTROL_CHANNEL_LABEL = "org.matrix.msc4575.rtc.full_mesh.control";
const CONTROL_CHANNEL_ID = 0;

export type ControlMessage =
  | {
      type: "description";
      description: { type: "offer" | "answer"; sdp: string };
      track_metadata?: TrackMetadata;
    }
  | { type: "candidates"; candidates: RTCIceCandidateInit[] }
  | { type: "track_metadata"; track_metadata: TrackMetadata }
  | { type: "consumption_metadata"; consumption_metadata: ConsumptionMetadata };

export function createControlChannel(pc: RTCPeerConnection): RTCDataChannel {
  return pc.createDataChannel(CONTROL_CHANNEL_LABEL, {
    negotiated: true,
    id: CONTROL_CHANNEL_ID,
  });
}

/** A received control message, or null for one to ignore: malformed, or of a type we don't know. */
export function parseControlMessage(data: unknown): ControlMessage | null {
  if (typeof data !== "string") return null;
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (typeof m !== "object" || m === null) return null;
  switch (m.type) {
    case "description": {
      const d = m.description as { type?: unknown; sdp?: unknown } | undefined;
      if (
        (d?.type !== "offer" && d?.type !== "answer") ||
        typeof d.sdp !== "string"
      )
        return null;
      return {
        type: "description",
        description: { type: d.type, sdp: d.sdp },
        track_metadata: parseTrackMetadata(m.track_metadata) ?? undefined,
      };
    }
    case "candidates":
      if (!Array.isArray(m.candidates)) return null;
      return {
        type: "candidates",
        candidates: m.candidates as RTCIceCandidateInit[],
      };
    case "track_metadata": {
      const metadata = parseTrackMetadata(m.track_metadata);
      return metadata && { type: "track_metadata", track_metadata: metadata };
    }
    case "consumption_metadata": {
      const metadata = parseConsumptionMetadata(m.consumption_metadata);
      return (
        metadata && {
          type: "consumption_metadata",
          consumption_metadata: metadata,
        }
      );
    }
    default:
      return null;
  }
}

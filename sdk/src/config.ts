/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The MatrixRTC mode determines how the client interacts with the MatrixRTC
 * backend and other participants. Resolved by the host.
 */
export enum MatrixRTCMode {
  /** Multi-SFU transport, legacy JWT endpoint, state events. */
  Compatibility = "compatibility",
  /**
   * Multi-SFU transport with sticky events, a hashed RTC backend identity and
   * the new JWT endpoint for the local membership. Remote memberships always
   * try the new endpoint first, then the legacy one.
   */
  Matrix_2_0 = "matrix_2_0",
}

export interface DelayedLeaveTimings {
  /** How long (in milliseconds) the homeserver waits before sending the delayed leave. */
  delay_ms: number;
  /** How often (in milliseconds) the client restarts the delayed leave. */
  restart_ms?: number;
  /** How long (in milliseconds) a restart may take before it counts as failed. */
  restart_timeout_ms?: number;
}

/**
 * The session's timings. A host that has them in its configuration passes
 * them in; these are the defaults a MatrixRTC backend is expected to accept.
 */
export interface SessionTimings {
  /** How long the sync may be down before the client counts as disconnected. */
  syncDisconnectGracePeriodMs: number;
  /** How long to wait before retrying after a network error on any request. */
  networkErrorRetryMs: number;
  /** How long to wait before rotating the media key when someone leaves. */
  waitForKeyRotationMs?: number;
  /** When the membership expires if the client stops renewing it. */
  membershipEventExpiryMs?: number;
  /** The session size at which the media key stops being rotated. */
  keyRotationParticipantLimit?: number;
  delayedLeave: DelayedLeaveTimings;
  /**
   * The timings used where the SFU restarts the delayed leave on the
   * client's behalf, which lets the client stop renewing it itself.
   */
  delegatedDelayedLeave: DelayedLeaveTimings;
}

export const defaultSessionTimings: SessionTimings = {
  syncDisconnectGracePeriodMs: 10_000,
  networkErrorRetryMs: 1_000,
  delayedLeave: { delay_ms: 18_000, restart_ms: 4_000 },
  delegatedDelayedLeave: { delay_ms: 3_600_000, restart_ms: 300_000 },
};

/** Media quality settings a host may pass; everything is optional. */
export interface MediaQuality {
  /** Video codec preference. The server must also have the codec enabled. Default `vp8`. */
  video_codec?: "vp8" | "vp9" | "h264" | "av1";
  video?: {
    /** Max resolution height in pixels. Default 720. */
    max_resolution?: number;
    /** Max bitrate in bits per second. Default 1700000. */
    max_bitrate?: number;
    /** Max framerate. Default 30. */
    max_framerate?: number;
    /** Simulcast layers, lowest quality first. Default 180p and 360p. */
    simulcast_layers?: Array<{ height: number; bitrate: number }>;
  };
  screen_share?: {
    /** Max resolution height in pixels. Default 1080. */
    max_resolution?: number;
    /** Max bitrate in bits per second. Default 5000000. */
    max_bitrate?: number;
    /** Max framerate. Default 30. */
    max_framerate?: number;
    /** Simulcast layers, lowest quality first. Without them LiveKit adds one layer at half resolution. */
    simulcast_layers?: Array<{
      height: number;
      bitrate: number;
      framerate?: number;
    }>;
  };
}

export const defaultMediaQuality = {
  video_codec: "vp8",
  video: { max_resolution: 720, max_bitrate: 1_700_000, max_framerate: 30 },
  screen_share: {
    max_resolution: 1080,
    max_bitrate: 5_000_000,
    max_framerate: 30,
  },
} as const satisfies MediaQuality;

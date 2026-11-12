/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { MatrixRTCError, type ParticipationState } from "./api";
import { type MembershipState } from "./matrixrtc/LocalMembership";
import { MediaConnectionState } from "./media-backend/api";
import { participationState } from "./participationState";

const error = new MatrixRTCError("gone");
const waiting: ParticipationState = { kind: "waitingForTransport" };
const connecting: ParticipationState = { kind: "connecting" };
const connected: ParticipationState = { kind: "connected" };
const reconnecting: ParticipationState = {
  kind: "reconnecting",
  reason: "media",
};
const joined: MembershipState = { kind: "joined" };

describe("participationState", () => {
  it.each<
    [
      string,
      ParticipationState,
      MembershipState,
      MediaConnectionState | Error,
      ParticipationState,
    ]
  >([
    [
      "no transport yet",
      waiting,
      { kind: "waitingForTransport" },
      MediaConnectionState.Initialized,
      waiting,
    ],
    [
      "joining",
      waiting,
      { kind: "joining" },
      MediaConnectionState.Connecting,
      connecting,
    ],
    [
      "joined, media still connecting",
      connecting,
      joined,
      MediaConnectionState.Connecting,
      connecting,
    ],
    [
      "both links up",
      connecting,
      joined,
      MediaConnectionState.Connected,
      connected,
    ],
    [
      "media dropped after connecting",
      connected,
      joined,
      MediaConnectionState.Reconnecting,
      reconnecting,
    ],
    [
      "homeserver dropped after connecting",
      connected,
      { kind: "reconnecting", reason: "sync" },
      MediaConnectionState.Connected,
      { kind: "reconnecting", reason: "sync" },
    ],
    [
      "the matrix side wins over the media side",
      reconnecting,
      { kind: "reconnecting", reason: "membership" },
      MediaConnectionState.Reconnecting,
      { kind: "reconnecting", reason: "membership" },
    ],
    [
      "membership reconnecting before the media ever came up",
      connecting,
      { kind: "reconnecting", reason: "sync" },
      MediaConnectionState.Connecting,
      connecting,
    ],
    [
      "back from a reconnect",
      reconnecting,
      joined,
      MediaConnectionState.Connected,
      connected,
    ],
    [
      "a membership error",
      connected,
      { kind: "failed", error },
      MediaConnectionState.Connected,
      { kind: "failed", error },
    ],
    [
      "a media connection error",
      connected,
      joined,
      error,
      { kind: "failed", error },
    ],
    [
      "failed stays failed",
      { kind: "failed", error },
      joined,
      MediaConnectionState.Connected,
      { kind: "failed", error },
    ],
    [
      "left",
      connected,
      { kind: "left" },
      MediaConnectionState.Stopped,
      { kind: "left" },
    ],
    [
      "left after an error",
      { kind: "failed", error },
      { kind: "left" },
      MediaConnectionState.Stopped,
      { kind: "left" },
    ],
  ])("%s", (_name, previous, membership, media, expected) => {
    expect(participationState(previous, membership, media)).toEqual(expected);
  });

  it("wraps a plain media error", () => {
    const state = participationState(connected, joined, new Error("boom"));
    expect(state.kind).toBe("failed");
    if (state.kind === "failed") {
      expect(state.error).toBeInstanceOf(MatrixRTCError);
      expect(state.error.cause).toBeInstanceOf(Error);
    }
  });
});

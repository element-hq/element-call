/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { test, expect } from "vitest";
import { type RTCCallIntent } from "matrix-js-sdk/lib/matrixrtc";

import { calculateInitialMuteState } from "./initialMuteState";

test.each<{
  callIntent: RTCCallIntent;
  allowJoinUnmutedViaIntent: boolean;
}>([
  { callIntent: "audio", allowJoinUnmutedViaIntent: false },
  { callIntent: "audio", allowJoinUnmutedViaIntent: true },
  { callIntent: "video", allowJoinUnmutedViaIntent: false },
  { callIntent: "video", allowJoinUnmutedViaIntent: true },
  { callIntent: "unknown", allowJoinUnmutedViaIntent: false },
  { callIntent: "unknown", allowJoinUnmutedViaIntent: true },
])(
  "Should allow to unmute on start if not skipping lobby (callIntent: $callIntent, allowJoinUnmutedViaIntent: $allowJoinUnmutedViaIntent)",
  ({ callIntent, allowJoinUnmutedViaIntent }) => {
    const { audioEnabled, videoEnabled } = calculateInitialMuteState(
      false,
      callIntent,
      allowJoinUnmutedViaIntent,
    );
    expect(audioEnabled).toBe(true);
    expect(videoEnabled).toBe(callIntent !== "audio");
  },
);

test.each<{
  callIntent: RTCCallIntent;
}>([
  { callIntent: "audio" },
  { callIntent: "video" },
  { callIntent: "unknown" },
])(
  "Should always mute on start if skipping lobby and the host does not vouch for the intent (callIntent: $callIntent)",
  ({ callIntent }) => {
    const { audioEnabled, videoEnabled } = calculateInitialMuteState(
      true,
      callIntent,
      false,
    );
    expect(audioEnabled).toBe(false);
    expect(videoEnabled).toBe(false);
  },
);

test.each<{
  callIntent: RTCCallIntent;
}>([
  { callIntent: "audio" },
  { callIntent: "video" },
  { callIntent: "unknown" },
])(
  "Can start unmuted if skipping lobby and the host vouches for the intent (callIntent: $callIntent)",
  ({ callIntent }) => {
    const { audioEnabled, videoEnabled } = calculateInitialMuteState(
      true,
      callIntent,
      true,
    );
    expect(audioEnabled).toBe(true);
    expect(videoEnabled).toBe(callIntent !== "audio");
  },
);

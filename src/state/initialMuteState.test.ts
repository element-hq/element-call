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
  packageType: "full" | "embedded";
}>([
  { callIntent: "audio", packageType: "full" },
  { callIntent: "audio", packageType: "embedded" },
  { callIntent: "video", packageType: "full" },
  { callIntent: "video", packageType: "embedded" },
  { callIntent: "unknown", packageType: "full" },
  { callIntent: "unknown", packageType: "embedded" },
])(
  "Should allow to unmute on start if not skipping lobby (callIntent: $callIntent, packageType: $packageType)",
  ({ callIntent, packageType }) => {
    const { audioEnabled, videoEnabled } = calculateInitialMuteState(
      { skipLobby: false, callIntent },
      packageType,
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
  "Should always mute on start if skipping lobby on non embedded build (callIntent: $callIntent)",
  ({ callIntent }) => {
    const { audioEnabled, videoEnabled } = calculateInitialMuteState(
      { skipLobby: true, callIntent },
      "full",
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
  "Can start unmuted if skipping lobby on embedded build (callIntent: $callIntent)",
  ({ callIntent }) => {
    const { audioEnabled, videoEnabled } = calculateInitialMuteState(
      { skipLobby: true, callIntent },
      "embedded",
    );
    expect(audioEnabled).toBe(true);
    expect(videoEnabled).toBe(callIntent !== "audio");
  },
);

test.each<{
  isDevBuild: boolean;
  currentHost: string;
  expectedEnabled: boolean;
}>([
  { isDevBuild: true, currentHost: "localhost", expectedEnabled: true },
  { isDevBuild: false, currentHost: "localhost", expectedEnabled: false },
  { isDevBuild: true, currentHost: "call.example.com", expectedEnabled: false },
  {
    isDevBuild: false,
    currentHost: "call.example.com",
    expectedEnabled: false,
  },
])(
  "Should trust localhost domain when in dev mode isDevBuild($isDevBuild) host($currentHost)",
  ({ isDevBuild, currentHost, expectedEnabled }) => {
    const { audioEnabled, videoEnabled } = calculateInitialMuteState(
      { skipLobby: true, callIntent: "video" },
      "full",
      currentHost,
      isDevBuild,
    );

    expect(audioEnabled).toBe(expectedEnabled);
    expect(videoEnabled).toBe(expectedEnabled);
  },
);

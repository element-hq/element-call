/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Which way a camera faces. Laptop and desktop cameras don't say and face the
 * user; of those, a phone used as a webcam (Continuity Camera) films with its
 * rear camera and OBS shows a scene, so neither is taken to face the user.
 * LiveKit makes the same guess.
 */
export function facingModeOf(track: MediaStreamTrack): "user" | "environment" {
  const { facingMode } = track.getSettings();
  if (facingMode === "user" || facingMode === "environment") return facingMode;
  const label = track.label.trim().toLowerCase();
  return label === "obs virtual camera" ||
    label.includes("iphone") ||
    label.includes("ipad")
    ? "environment"
    : "user";
}

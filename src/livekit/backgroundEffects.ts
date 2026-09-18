/*
Copyright 2024-2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import indoorStandIn from "../graphics/background-indoor-standin.jpg?url";
import outdoorStandIn from "../graphics/background-outdoor-standin.jpg?url";

/** How much to blur, when the chosen effect is blur. */
export const blurRadius = 15;

export interface ShippedBackground {
  id: string;
  imagePath: string;
}

// EXPLORATION SHORTCUT (S1): the two shipped backgrounds, one indoor and one
// outdoor, do not exist yet. These stand-ins are the app's own gradients, laid
// on the canvas colour they are painted over and kept as JPEG.
//
// Not a detail: those gradients are overlay scrims, and measured, not one
// pixel in either is opaque — where they look dark they are transparent. Used
// directly as a background their dark half was simply absent, which is what
// showed on the slow path. Flattening them is what makes them a picture rather
// than a veil, and JPEG cannot carry transparency at all, so it cannot come
// back. Never port this.
export const shippedBackgrounds: ShippedBackground[] = [
  { id: "indoor", imagePath: indoorStandIn },
  { id: "outdoor", imagePath: outdoorStandIn },
];

export type BackgroundEffect =
  | { kind: "none" }
  | { kind: "blur" }
  /** One of the images that come with the application. */
  | { kind: "shipped"; id: string }
  /** One the user added, kept on this device. */
  | { kind: "added"; id: string };

export const noEffect: BackgroundEffect = { kind: "none" };

/**
 * Parses the stored form of a chosen effect, falling back to no effect.
 *
 * A shipped background is checked against what we ship, so a stored one that a
 * later release no longer carries falls back rather than leaving the user with
 * an effect that cannot be drawn. An added one cannot be checked here — only
 * the device knows what it keeps — so that check belongs where it is resolved.
 */
export function parseEffect(raw: string): BackgroundEffect {
  if (raw === "blur") return { kind: "blur" };
  if (raw.startsWith("image:")) {
    const id = raw.slice("image:".length);
    if (shippedBackgrounds.some((b) => b.id === id))
      return { kind: "shipped", id };
  }
  if (raw.startsWith("added:")) {
    const id = raw.slice("added:".length);
    if (id) return { kind: "added", id };
  }
  return noEffect;
}

/** The stored form of a chosen effect. */
export function serializeEffect(effect: BackgroundEffect): string {
  switch (effect.kind) {
    case "blur":
      return "blur";
    case "shipped":
      return `image:${effect.id}`;
    case "added":
      return `added:${effect.id}`;
    default:
      return "none";
  }
}

export function imagePathFor(id: string): string | undefined {
  return shippedBackgrounds.find((b) => b.id === id)?.imagePath;
}

/*
Copyright 2024-2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import desktopGradient from "../graphics/desktop-gradient.png?url";
import mobileGradient from "../graphics/mobile-gradient.png?url";

/** How much to blur, when the chosen effect is blur. */
export const blurRadius = 15;

export interface ShippedBackground {
  id: string;
  imagePath: string;
}

// EXPLORATION SHORTCUT (S1): the two shipped backgrounds, one indoor and one
// outdoor, do not exist yet. These stand-ins are existing gradient assets, so
// the pipeline can be exercised and measured. Never port this.
export const shippedBackgrounds: ShippedBackground[] = [
  { id: "indoor", imagePath: desktopGradient },
  { id: "outdoor", imagePath: mobileGradient },
];

export type BackgroundEffect =
  | { kind: "none" }
  | { kind: "blur" }
  | { kind: "image"; id: string };

export const noEffect: BackgroundEffect = { kind: "none" };

/** Parses the stored form of a chosen effect, falling back to no effect. */
export function parseEffect(raw: string): BackgroundEffect {
  if (raw === "blur") return { kind: "blur" };
  if (raw.startsWith("image:")) {
    const id = raw.slice("image:".length);
    if (shippedBackgrounds.some((b) => b.id === id)) return { kind: "image", id };
  }
  return noEffect;
}

/** The stored form of a chosen effect. */
export function serializeEffect(effect: BackgroundEffect): string {
  switch (effect.kind) {
    case "blur":
      return "blur";
    case "image":
      return `image:${effect.id}`;
    default:
      return "none";
  }
}

export function imagePathFor(id: string): string | undefined {
  return shippedBackgrounds.find((b) => b.id === id)?.imagePath;
}

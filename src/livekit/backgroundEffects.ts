/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import arc from "../graphics/background-arc.jpg?url";
import glow from "../graphics/background-glow.jpg?url";

export const blurRadius = 15;

export interface ShippedBackground {
  /** Stored in the user's settings when chosen, so it must not change. */
  id: string;
  imagePath: string;
}

export const shippedBackgrounds: ShippedBackground[] = [
  { id: "arc", imagePath: arc },
  { id: "glow", imagePath: glow },
];

export type BackgroundEffect =
  | { kind: "none" }
  | { kind: "blur" }
  | { kind: "shipped"; id: string };

/** An effect as the setting stores it, and as the menu names its option. */
export type EffectId = "none" | "blur" | `image:${string}`;

export const noEffect: BackgroundEffect = { kind: "none" };

/**
 * Reads a stored effect; one we no longer ship reads as no effect. Stored by
 * hand or by another build, the value need not even be a string.
 */
export function parseEffect(raw: unknown): BackgroundEffect {
  if (typeof raw !== "string") return noEffect;
  if (raw === "blur") return { kind: "blur" };
  if (raw.startsWith("image:")) {
    const id = raw.slice("image:".length);
    if (shippedBackgrounds.some((b) => b.id === id))
      return { kind: "shipped", id };
  }
  return noEffect;
}

export function serializeEffect(effect: BackgroundEffect): EffectId {
  switch (effect.kind) {
    case "blur":
      return "blur";
    case "shipped":
      return `image:${effect.id}`;
    default:
      return "none";
  }
}

export function imagePathFor(id: string): string | undefined {
  return shippedBackgrounds.find((b) => b.id === id)?.imagePath;
}

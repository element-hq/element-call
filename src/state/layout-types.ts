/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type BehaviorSubject } from "rxjs";

import { type LocalUserMediaViewModel } from "./media/LocalUserMediaViewModel.ts";
import { type MediaViewModel } from "./media/MediaViewModel.ts";
import { type RingingMediaViewModel } from "./media/RingingMediaViewModel.ts";
import { type UserMediaViewModel } from "./media/UserMediaViewModel.ts";
import {
  type GridTileViewModel,
  type SpotlightTileViewModel,
} from "./TileViewModel.ts";
import { type Behavior } from "./Behavior.ts";
import { shallowEquals as arrayShallowEquals } from "../utils/array.ts";

export interface GridLayoutMedia {
  type: "grid";
  edgeToEdge: false;
  spotlight?: MediaViewModel[];
  grid: UserMediaViewModel[];
}

export interface SpotlightLandscapeLayoutMedia {
  type: "spotlight-landscape";
  edgeToEdge: boolean;
  spotlight: MediaViewModel[];
  grid: UserMediaViewModel[];
}

export interface SpotlightPortraitLayoutMedia {
  type: "spotlight-portrait";
  edgeToEdge: false;
  spotlight: MediaViewModel[];
  grid: UserMediaViewModel[];
}

export interface SpotlightExpandedLayoutMedia {
  type: "spotlight-expanded";
  edgeToEdge: boolean;
  spotlight: MediaViewModel[];
  pip?: UserMediaViewModel;
}

export interface OneOnOneDesktopLayoutMedia {
  type: "one-on-one-desktop";
  edgeToEdge: false;
  spotlight: UserMediaViewModel;
  pip: LocalUserMediaViewModel | RingingMediaViewModel;
}

export interface OneOnOneMobileLayoutMedia {
  type: "one-on-one-mobile";
  edgeToEdge: true;
  spotlight: UserMediaViewModel | RingingMediaViewModel;
  pip?: LocalUserMediaViewModel;
}

export interface PipLayoutMedia {
  type: "pip";
  edgeToEdge: boolean;
  spotlight: MediaViewModel[];
}

export type LayoutMedia =
  | GridLayoutMedia
  | SpotlightLandscapeLayoutMedia
  | SpotlightPortraitLayoutMedia
  | SpotlightExpandedLayoutMedia
  | OneOnOneDesktopLayoutMedia
  | OneOnOneMobileLayoutMedia
  | PipLayoutMedia;

export interface Alignment {
  inline: "start" | "end";
  block: "start" | "end";
}

export interface GridLayout {
  type: "grid";
  spotlight?: SpotlightTileViewModel;
  grid: GridTileViewModel[];
  spotlightAlignment$: BehaviorSubject<Alignment>;
  setVisibleTiles: (value: number) => void;
}

export interface SpotlightLandscapeLayout {
  type: "spotlight-landscape";
  spotlight: SpotlightTileViewModel;
  grid: GridTileViewModel[];
  setVisibleTiles: (value: number) => void;
}

export interface SpotlightPortraitLayout {
  type: "spotlight-portrait";
  spotlight: SpotlightTileViewModel;
  grid: GridTileViewModel[];
  setVisibleTiles: (value: number) => void;
}

export interface SpotlightExpandedLayout {
  type: "spotlight-expanded";
  spotlight: SpotlightTileViewModel;
  pip?: GridTileViewModel;
  pipAlignment$: BehaviorSubject<Alignment>;
}

export interface OneOnOneDesktopLayout {
  type: "one-on-one-desktop";
  spotlight: GridTileViewModel;
  pip: GridTileViewModel;
  pipAlignment$: BehaviorSubject<Alignment>;
}

export interface OneOnOneMobileLayout {
  type: "one-on-one-mobile";
  spotlight: SpotlightTileViewModel;
  pip?: GridTileViewModel;
  pipSize$: Behavior<"sm" | "lg">;
  pipAlignment$: BehaviorSubject<Alignment>;
}

export interface PipLayout {
  type: "pip";
  spotlight: SpotlightTileViewModel;
}

/**
 * A layout defining the media tiles present on screen and their visual
 * arrangement.
 */
export type Layout =
  | GridLayout
  | SpotlightLandscapeLayout
  | SpotlightPortraitLayout
  | SpotlightExpandedLayout
  | OneOnOneDesktopLayout
  | OneOnOneMobileLayout
  | PipLayout;

/**
 * Tests whether the top-level properties and array elements of layout `a` are
 * equal to those of layout `b`. Useful for deduping redundant layout updates.
 */
export function layoutShallowEquals(a: Layout, b: Layout): boolean {
  // If a and b have the same number of keys and every key in a is also in b,
  // then they have the same keys.
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!(key in b)) return false;

    // Now check that they have the same values.
    const aValue = (a as any)[key];
    const bValue = (b as any)[key];
    if (Array.isArray(aValue) && Array.isArray(bValue)) {
      // Special case for arrays so we can detect when the grid tiles arrays are
      // essentially the same.
      if (!arrayShallowEquals(aValue, bValue)) return false;
    } else if (aValue !== bValue) return false;
  }

  return true;
}

/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type LocalUserMediaViewModel } from "./media/LocalUserMediaViewModel.ts";
import { type MediaViewModel } from "./media/MediaViewModel.ts";
import { type RingingMediaViewModel } from "./media/RingingMediaViewModel.ts";
import { type UserMediaViewModel } from "./media/UserMediaViewModel.ts";
import {
  type GridTileViewModel,
  type SpotlightTileViewModel,
} from "./TileViewModel.ts";
import { type Behavior } from "./Behavior.ts";
import { type FloatingTile } from "./FloatingTile.ts";
import { shallowEquals } from "../utils/object.ts";
import { shallowEquals as arrayShallowEquals } from "../utils/array.ts";

/**
 * The general shape of the space the call is drawn in. Called a window because
 * that is what it is in the standalone app; for a component it is the container
 * the host gave us, which may be a small corner of a large window.
 */
export type WindowMode = "normal" | "narrow" | "flat" | "pip";

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

export interface Drag {
  /**
   * The X offset of the dragged tile relative to its container.
   */
  x: number;
  /**
   * The Y offset of the dragged tile relative to its container.
   */
  y: number;
  /**
   * The X coordinate of the dragged tile, as a scalar of the container's width.
   */
  xRatio: number;
  /**
   * The Y coordinate of the dragged tile, as a scalar of the container's height.
   */
  yRatio: number;
  /**
   * Whether this event ends the drag gesture.
   */
  endOfGesture: boolean;
}

export type DragCallback = (drag: Drag) => void;

export interface GridLayout {
  type: "grid";
  spotlight?: FloatingTile & { vm: SpotlightTileViewModel };
  grid: GridTileViewModel[];
  setVisibleTiles: (value: number) => void;
}

export interface SpotlightLandscapeLayout {
  type: "spotlight-landscape";
  spotlight: { vm: SpotlightTileViewModel };
  grid: GridTileViewModel[];
  setVisibleTiles: (value: number) => void;
}

export interface SpotlightPortraitLayout {
  type: "spotlight-portrait";
  spotlight: { vm: SpotlightTileViewModel };
  grid: GridTileViewModel[];
  setVisibleTiles: (value: number) => void;
}

export interface SpotlightExpandedLayout {
  type: "spotlight-expanded";
  spotlight: SpotlightTileViewModel;
  pip?: FloatingTile & { vm: GridTileViewModel };
}

export interface OneOnOneDesktopLayout {
  type: "one-on-one-desktop";
  spotlight: GridTileViewModel;
  pip: FloatingTile & { vm: GridTileViewModel };
}

export interface OneOnOneMobileLayout {
  type: "one-on-one-mobile";
  spotlight: SpotlightTileViewModel;
  pip?: FloatingTile & { vm: GridTileViewModel; size$: Behavior<"sm" | "lg"> };
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
 * Tests whether the top-level properties, tile wrapper properties, and array
 * elements of layout `a` are equal to those of layout `b`. Useful for deduping
 * redundant layout updates.
 */
export function layoutShallowEquals(a: Layout, b: Layout): boolean {
  return shallowEquals<Layout>(a, b, (aValue, bValue) => {
    // Special case for tile wrapper objects so we can detect when the
    // spotlight or PiP tile is essentially the same
    if (
      typeof aValue === "object" &&
      aValue !== null &&
      "vm" in aValue &&
      typeof bValue === "object" &&
      bValue !== null &&
      "vm" in bValue
    )
      return shallowEquals(aValue, bValue);

    // Special case for arrays so we can detect when the grid tile arrays are
    // essentially the same
    if (Array.isArray(aValue) && Array.isArray(bValue))
      return arrayShallowEquals(aValue, bValue);

    return aValue === bValue;
  });
}

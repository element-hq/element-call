/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type BehaviorSubject, type Observable } from "rxjs";
import { type ComponentType } from "react";

import { type LayoutProps } from "./Grid";
import { type TileViewModel } from "../state/TileViewModel";

export interface Bounds {
  width: number;
  height: number;
}

export interface Alignment {
  inline: "start" | "end";
  block: "start" | "end";
}

export const defaultSpotlightAlignment: Alignment = {
  inline: "end",
  block: "end",
};
export const defaultPipAlignment: Alignment = { inline: "end", block: "start" };

export interface CallLayoutInputs {
  /**
   * The minimum bounds of the layout area.
   */
  minBounds$: Observable<Bounds>;
  /**
   * The alignment of the floating spotlight tile, if present.
   */
  spotlightAlignment$: BehaviorSubject<Alignment>;
  /**
   * The alignment of the small picture-in-picture tile, if present.
   */
  pipAlignment$: BehaviorSubject<Alignment>;
}

export interface CallLayoutOutputs<Model> {
  /**
   * Whether the scrolling layer of the layout should appear on top.
   */
  scrollingOnTop: boolean;
  /**
   * The visually fixed (non-scrolling) layer of the layout.
   */
  fixed: ComponentType<LayoutProps<Model, TileViewModel, HTMLDivElement>>;
  /**
   * The layer of the layout that can overflow and be scrolled.
   */
  scrolling: ComponentType<LayoutProps<Model, TileViewModel, HTMLDivElement>>;
}

/**
 * A layout system for media tiles.
 */
export type CallLayout<Model> = (
  inputs: CallLayoutInputs,
) => CallLayoutOutputs<Model>;

export interface GridArrangement {
  tileWidth: number;
  tileHeight: number;
  gap: number;
  columns: number;
}

const tileMaxAspectRatio = 17 / 9;
const tileMinAspectRatio = 4 / 3;

/**
 * Determine the ideal arrangement of tiles into a grid of a particular size.
 */
export function arrangeTiles(
  width: number,
  minHeight: number,
  tileCount: number,
): GridArrangement {
  // The goal here is to determine the grid size and padding that maximizes
  // use of screen space for n tiles without making those tiles too small or
  // too cropped (having an extreme aspect ratio)
  const gap = width < 800 ? 16 : 20;
  const area = width * minHeight;
  // Magic numbers that make tiles scale up nicely as the window gets larger
  const tileArea = Math.pow(Math.sqrt(area) / 8 + 125, 2);
  const tilesPerPage = Math.min(tileCount, area / tileArea);

  let columns = Math.min(
    // Don't create more columns than we have items for
    tilesPerPage,
    // The ideal number of columns is given by a packing of equally-sized
    // squares into a grid.
    // width / column = height / row.
    // columns * rows = number of squares.
    // ∴ columns = sqrt(width / height * number of squares).
    // Except we actually want 16:9-ish tiles rather than squares, so we
    // divide the width-to-height ratio by the target aspect ratio.
    Math.round(
      Math.sqrt((width / minHeight / tileMinAspectRatio) * tilesPerPage),
    ),
  );
  let rows = tilesPerPage / columns;
  // If all the tiles could fit on one page, we want to ensure that they do by
  // not leaving fractional rows hanging off the bottom
  if (tilesPerPage === tileCount) {
    rows = Math.ceil(rows);
    // We may now be able to fit the tiles into fewer columns
    columns = Math.ceil(tileCount / rows);
  }

  let tileWidth = (width - (columns + 1) * gap) / columns;
  let tileHeight = (minHeight - (rows - 1) * gap) / rows;

  // Impose a minimum and maximum aspect ratio on the tiles
  const tileAspectRatio = tileWidth / tileHeight;
  if (tileAspectRatio > tileMaxAspectRatio)
    tileWidth = tileHeight * tileMaxAspectRatio;
  else if (tileAspectRatio < tileMinAspectRatio)
    tileHeight = tileWidth / tileMinAspectRatio;

  return { tileWidth, tileHeight, gap, columns };
}

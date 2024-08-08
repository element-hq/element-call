/*
Copyright 2024 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { BehaviorSubject, Observable } from "rxjs";
import { ComponentType } from "react";

import { MediaViewModel, UserMediaViewModel } from "../state/MediaViewModel";
import { LayoutProps } from "./Grid";

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
  minBounds: Observable<Bounds>;
  /**
   * The alignment of the floating spotlight tile, if present.
   */
  spotlightAlignment: BehaviorSubject<Alignment>;
  /**
   * The alignment of the small picture-in-picture tile, if present.
   */
  pipAlignment: BehaviorSubject<Alignment>;
}

export interface GridTileModel {
  type: "grid";
  vm: UserMediaViewModel;
}

export interface SpotlightTileModel {
  type: "spotlight";
  vms: MediaViewModel[];
  maximised: boolean;
}

export type TileModel = GridTileModel | SpotlightTileModel;

export interface CallLayoutOutputs<Model> {
  /**
   * Whether the scrolling layer of the layout should appear on top.
   */
  scrollingOnTop: boolean;
  /**
   * The visually fixed (non-scrolling) layer of the layout.
   */
  fixed: ComponentType<LayoutProps<Model, TileModel, HTMLDivElement>>;
  /**
   * The layer of the layout that can overflow and be scrolled.
   */
  scrolling: ComponentType<LayoutProps<Model, TileModel, HTMLDivElement>>;
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

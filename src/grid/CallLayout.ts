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

const tileMinHeight = 130;
const tileMaxAspectRatio = 17 / 9;
const tileMinAspectRatio = 4 / 3;
const tileMobileMinAspectRatio = 2 / 3;

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
  const tileMinWidth = width < 500 ? 150 : 180;

  let columns = Math.min(
    // Don't create more columns than we have items for
    tileCount,
    // The ideal number of columns is given by a packing of equally-sized
    // squares into a grid.
    // width / column = height / row.
    // columns * rows = number of squares.
    // ∴ columns = sqrt(width / height * number of squares).
    // Except we actually want 16:9-ish tiles rather than squares, so we
    // divide the width-to-height ratio by the target aspect ratio.
    Math.ceil(Math.sqrt((width / minHeight / tileMaxAspectRatio) * tileCount)),
  );
  let rows = Math.ceil(tileCount / columns);

  let tileWidth = (width - (columns - 1) * gap) / columns;
  let tileHeight = (minHeight - (rows - 1) * gap) / rows;

  // Impose a minimum width and height on the tiles
  if (tileWidth < tileMinWidth) {
    // In this case we want the tile width to determine the number of columns,
    // not the other way around. If we take the above equation for the tile
    // width (w = (W - (c - 1) * g) / c) and solve for c, we get
    // c = (W + g) / (w + g).
    columns = Math.floor((width + gap) / (tileMinWidth + gap));
    rows = Math.ceil(tileCount / columns);
    tileWidth = (width - (columns - 1) * gap) / columns;
    tileHeight = (minHeight - (rows - 1) * gap) / rows;
  }
  if (tileHeight < tileMinHeight) tileHeight = tileMinHeight;

  // Impose a minimum and maximum aspect ratio on the tiles
  const tileAspectRatio = tileWidth / tileHeight;
  // We enforce a different min aspect ratio in 1:1s on mobile
  const minAspectRatio =
    tileCount === 1 && width < 600
      ? tileMobileMinAspectRatio
      : tileMinAspectRatio;
  if (tileAspectRatio > tileMaxAspectRatio)
    tileWidth = tileHeight * tileMaxAspectRatio;
  else if (tileAspectRatio < minAspectRatio)
    tileHeight = tileWidth / minAspectRatio;
  // TODO: We might now be hitting the minimum height or width limit again

  return { tileWidth, tileHeight, gap, columns };
}

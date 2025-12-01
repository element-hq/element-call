/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Layout, type LayoutMedia } from "./layout-types.ts";
import { type TileStore } from "./TileStore";

export type GridLikeLayoutType =
  | "grid"
  | "spotlight-landscape"
  | "spotlight-portrait";

/**
 * Produces a grid-like layout (any layout with a grid and possibly a spotlight)
 * with the given media.
 */
export function gridLikeLayout(
  media: LayoutMedia & { type: GridLikeLayoutType },
  visibleTiles: number,
  setVisibleTiles: (value: number) => void,
  prevTiles: TileStore,
): [Layout & { type: GridLikeLayoutType }, TileStore] {
  const update = prevTiles.from(visibleTiles);
  if (media.spotlight !== undefined)
    update.registerSpotlight(
      media.spotlight,
      media.type === "spotlight-portrait",
    );
  for (const mediaVm of media.grid) update.registerGridTile(mediaVm);
  const tiles = update.build();

  return [
    {
      type: media.type,
      spotlight: tiles.spotlightTile,
      grid: tiles.gridTiles,
      setVisibleTiles,
    } as Layout & { type: GridLikeLayoutType },
    tiles,
  ];
}

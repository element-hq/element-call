/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { PipLayout, PipLayoutMedia } from "./CallViewModel";
import { TileStore } from "./TileStore";
import { GridTileViewModel } from "./TileViewModel";

/**
 * Produces a picture-in-picture layout with the given media.
 */
export function pipLayout(
  media: PipLayoutMedia,
  visibleTiles: Set<GridTileViewModel>,
  prevTiles: TileStore,
): [PipLayout, TileStore] {
  const update = prevTiles.from(visibleTiles);
  update.registerSpotlight(media.spotlight, true);
  const tiles = update.build();
  return [
    {
      type: media.type,
      spotlight: tiles.spotlightTile!,
    },
    tiles,
  ];
}

/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { OneOnOneLayout, OneOnOneLayoutMedia } from "./CallViewModel";
import { TileStore } from "./TileStore";
import { GridTileViewModel } from "./TileViewModel";

/**
 * Produces a one-on-one layout with the given media.
 */
export function oneOnOneLayout(
  media: OneOnOneLayoutMedia,
  visibleTiles: Set<GridTileViewModel>,
  prevTiles: TileStore,
): [OneOnOneLayout, TileStore] {
  const update = prevTiles.from(visibleTiles);
  update.registerGridTile(media.local);
  update.registerGridTile(media.remote);
  const tiles = update.build();
  return [
    {
      type: media.type,
      local: tiles.gridTilesByMedia.get(media.local)!,
      remote: tiles.gridTilesByMedia.get(media.remote)!,
    },
    tiles,
  ];
}

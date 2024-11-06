/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import {
  SpotlightExpandedLayout,
  SpotlightExpandedLayoutMedia,
} from "./CallViewModel";
import { TileStore } from "./TileStore";
import { GridTileViewModel } from "./TileViewModel";

/**
 * Produces an expanded spotlight layout with the given media.
 */
export function spotlightExpandedLayout(
  media: SpotlightExpandedLayoutMedia,
  visibleTiles: Set<GridTileViewModel>,
  prevTiles: TileStore,
): [SpotlightExpandedLayout, TileStore] {
  const update = prevTiles.from(visibleTiles);
  update.registerSpotlight(media.spotlight, true);
  if (media.pip !== undefined) update.registerGridTile(media.pip);
  const tiles = update.build();

  return [
    {
      type: media.type,
      spotlight: tiles.spotlightTile!,
      pip: tiles.gridTiles[0],
    },
    tiles,
  ];
}

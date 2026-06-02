/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type SpotlightExpandedLayout,
  type SpotlightExpandedLayoutMedia,
} from "./layout-types";
import { type TileStore } from "./TileStore";

/**
 * Produces an expanded spotlight layout with the given media.
 */
export function spotlightExpandedLayout(
  media: SpotlightExpandedLayoutMedia,
  prevTiles: TileStore,
): [SpotlightExpandedLayout, TileStore] {
  const update = prevTiles.from(1);
  update.registerSpotlight(media.spotlight, true);
  if (media.pip !== undefined) update.registerPipTile(media.pip);
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

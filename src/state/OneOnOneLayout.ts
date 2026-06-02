/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type OneOnOneLayout, type OneOnOneLayoutMedia } from "./layout-types";
import { type TileStore } from "./TileStore";

/**
 * Produces a one-on-one layout with the given media.
 */
export function oneOnOneLayout(
  media: OneOnOneLayoutMedia,
  prevTiles: TileStore,
): [OneOnOneLayout, TileStore] {
  const update = prevTiles.from(2);
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

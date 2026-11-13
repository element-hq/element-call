/*
Copyright 2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type OneOnOneDesktopLayout,
  type OneOnOneDesktopLayoutMedia,
} from "./layout-types";
import { type TileStore } from "./TileStore";
import { type FloatingTile } from "./FloatingTile";

/**
 * Produces a one-on-one desktop layout with the given media.
 */
export function oneOnOneDesktopLayout(
  media: OneOnOneDesktopLayoutMedia,
  pipTile: FloatingTile,
  prevTiles: TileStore,
): [OneOnOneDesktopLayout, TileStore] {
  const update = prevTiles.from(2);
  update.registerGridTile(media.pip);
  update.registerGridTile(media.spotlight);
  const tiles = update.build();

  return [
    {
      type: media.type,
      spotlight: tiles.gridTilesByMedia.get(media.spotlight)!,
      pip: { vm: tiles.gridTilesByMedia.get(media.pip)!, ...pipTile },
    },
    tiles,
  ];
}

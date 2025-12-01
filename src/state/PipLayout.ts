/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type PipLayout, type PipLayoutMedia } from "./layout-types.ts";
import { type TileStore } from "./TileStore";

/**
 * Produces a picture-in-picture layout with the given media.
 */
export function pipLayout(
  media: PipLayoutMedia,
  prevTiles: TileStore,
): [PipLayout, TileStore] {
  const update = prevTiles.from(0);
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

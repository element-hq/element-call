/*
Copyright 2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type BehaviorSubject } from "rxjs";

import {
  type Alignment,
  type OneOnOneLandscapeLayout,
  type OneOnOneLandscapeLayoutMedia,
} from "./layout-types";
import { type TileStore } from "./TileStore";

/**
 * Produces a one-on-one landscape layout with the given media.
 */
export function oneOnOneLandscapeLayout(
  media: OneOnOneLandscapeLayoutMedia,
  pipAlignment$: BehaviorSubject<Alignment>,
  prevTiles: TileStore,
): [OneOnOneLandscapeLayout, TileStore] {
  const update = prevTiles.from(2);
  update.registerGridTile(media.pip);
  update.registerGridTile(media.spotlight);
  const tiles = update.build();

  return [
    {
      type: media.type,
      spotlight: tiles.gridTilesByMedia.get(media.spotlight)!,
      pip: tiles.gridTilesByMedia.get(media.pip)!,
      pipAlignment$,
    },
    tiles,
  ];
}

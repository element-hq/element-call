/*
Copyright 2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type BehaviorSubject } from "rxjs";

import {
  type Alignment,
  type OneOnOneMobileLayout,
  type OneOnOneMobileLayoutMedia,
} from "./layout-types";
import { type TileStore } from "./TileStore";
import { type Behavior } from "./Behavior";

/**
 * Produces a one-on-one mobile layout with the given media.
 */
export function oneOnOneMobileLayout(
  media: OneOnOneMobileLayoutMedia,
  pipSize$: Behavior<"sm" | "lg">,
  pipAlignment$: BehaviorSubject<Alignment>,
  prevTiles: TileStore,
): [OneOnOneMobileLayout, TileStore] {
  const update = prevTiles.from(media.pip === undefined ? 0 : 1);
  update.registerSpotlight([media.spotlight], true, "transparent");
  if (media.pip !== undefined) update.registerGridTile(media.pip);
  const tiles = update.build();

  return [
    {
      type: media.type,
      spotlight: tiles.spotlightTile!,
      pip: media.pip && tiles.gridTilesByMedia.get(media.pip),
      pipSize$,
      pipAlignment$,
    },
    tiles,
  ];
}

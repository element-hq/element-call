/*
Copyright 2023 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import type { ComponentType } from "react";
import type { RectReadOnly } from "react-use-measure";
import type { TileDescriptor } from "./VideoGrid";

/**
 * A video grid layout system with concrete states of type State.
 */
export interface Layout<State> {
  /**
   * The layout state for zero tiles.
   */
  readonly emptyState: State;
  /**
   * Updates/adds/removes tiles in a way that looks natural in the context of
   * the given initial state.
   */
  readonly updateTiles: (s: State, tiles: TileDescriptor<unknown>[]) => State;
  /**
   * Adapts the layout to a new container size.
   */
  readonly updateBounds: (s: State, bounds: RectReadOnly) => State;
  /**
   * Gets tiles in the order created by the layout.
   */
  readonly getTiles: (s: State) => TileDescriptor<unknown>[];
  /**
   * Determines whether a tile is draggable.
   */
  readonly canDragTile: (s: State, tile: TileDescriptor<unknown>) => boolean;
  /**
   * Drags the tile 'from' to the location of the tile 'to' (if possible).
   * The position parameters are numbers in the range [0, 1) describing the
   * specific positions on 'from' and 'to' that the drag gesture is targeting.
   */
  readonly dragTile: (
    s: State,
    from: TileDescriptor<unknown>,
    to: TileDescriptor<unknown>,
    xPositionOnFrom: number,
    yPositionOnFrom: number,
    xPositionOnTo: number,
    yPositionOnTo: number
  ) => State;
  /**
   * Toggles the focus of the given tile (if this layout has the concept of
   * focus).
   */
  readonly toggleFocus?: (s: State, tile: TileDescriptor<unknown>) => State;
  /**
   * A React component generating the slot elements for a given layout state.
   */
  readonly Slots: ComponentType<{ s: State }>;
  /**
   * Whether the state of this layout should be remembered even while a
   * different layout is active.
   */
  readonly rememberState: boolean;
}

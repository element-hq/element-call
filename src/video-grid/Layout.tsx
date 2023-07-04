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

import { ComponentType, useCallback, useMemo, useRef } from "react";

import type { RectReadOnly } from "react-use-measure";
import { useReactiveState } from "../useReactiveState";
import type { TileDescriptor } from "./VideoGrid";

/**
 * A video grid layout system with concrete states of type State.
 */
// Ideally State would be parameterized by the tile data type, but then that
// makes Layout a higher-kinded type, which isn't achievable in TypeScript
// (unless you invoke some dark type-level computation magic… 😏)
// So we're stuck with these types being a little too strong.
export interface Layout<State> {
  /**
   * The layout state for zero tiles.
   */
  readonly emptyState: State;
  /**
   * Updates/adds/removes tiles in a way that looks natural in the context of
   * the given initial state.
   */
  readonly updateTiles: <T>(s: State, tiles: TileDescriptor<T>[]) => State;
  /**
   * Adapts the layout to a new container size.
   */
  readonly updateBounds: (s: State, bounds: RectReadOnly) => State;
  /**
   * Gets tiles in the order created by the layout.
   */
  readonly getTiles: <T>(s: State) => TileDescriptor<T>[];
  /**
   * Determines whether a tile is draggable.
   */
  readonly canDragTile: <T>(s: State, tile: TileDescriptor<T>) => boolean;
  /**
   * Drags the tile 'from' to the location of the tile 'to' (if possible).
   * The position parameters are numbers in the range [0, 1) describing the
   * specific positions on 'from' and 'to' that the drag gesture is targeting.
   */
  readonly dragTile: <T>(
    s: State,
    from: TileDescriptor<T>,
    to: TileDescriptor<T>,
    xPositionOnFrom: number,
    yPositionOnFrom: number,
    xPositionOnTo: number,
    yPositionOnTo: number
  ) => State;
  /**
   * Toggles the focus of the given tile (if this layout has the concept of
   * focus).
   */
  readonly toggleFocus?: <T>(s: State, tile: TileDescriptor<T>) => State;
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

/**
 * A version of Map with stronger types that allow us to save layout states in a
 * type-safe way.
 */
export interface LayoutStatesMap {
  get<State>(layout: Layout<State>): State | undefined;
  set<State>(layout: Layout<State>, state: State): LayoutStatesMap;
  delete<State>(layout: Layout<State>): boolean;
}

/**
 * Hook creating a Map to store layout states in.
 */
export const useLayoutStates = (): LayoutStatesMap => {
  const layoutStates = useRef<Map<unknown, unknown>>();
  if (layoutStates.current === undefined) layoutStates.current = new Map();
  return layoutStates.current as LayoutStatesMap;
};

/**
 * Hook which uses the provided layout system to arrange a set of items into a
 * concrete layout state, and provides callbacks for user interaction.
 */
export const useLayout = <State, T>(
  layout: Layout<State>,
  items: TileDescriptor<T>[],
  bounds: RectReadOnly,
  layoutStates: LayoutStatesMap
) => {
  const prevLayout = useRef<Layout<unknown>>();
  const prevState = layoutStates.get(layout);

  const [state, setState] = useReactiveState<State>(() => {
    // If the bounds aren't known yet, don't add anything to the layout
    if (bounds.width === 0) {
      return layout.emptyState;
    } else {
      if (
        prevLayout.current !== undefined &&
        layout !== prevLayout.current &&
        !prevLayout.current.rememberState
      )
        layoutStates.delete(prevLayout.current);

      const baseState = layoutStates.get(layout) ?? layout.emptyState;
      return layout.updateTiles(layout.updateBounds(baseState, bounds), items);
    }
  }, [layout, items, bounds]);

  const generation = useRef<number>(0);
  if (state !== prevState) generation.current++;

  prevLayout.current = layout as Layout<unknown>;
  // No point in remembering an empty state, plus it would end up clobbering the
  // real saved state while restoring a layout
  if (state !== layout.emptyState) layoutStates.set(layout, state);

  return {
    state,
    orderedItems: useMemo(() => layout.getTiles<T>(state), [layout, state]),
    generation: generation.current,
    canDragTile: useCallback(
      (tile: TileDescriptor<T>) => layout.canDragTile(state, tile),
      [layout, state]
    ),
    dragTile: useCallback(
      (
        from: TileDescriptor<T>,
        to: TileDescriptor<T>,
        xPositionOnFrom: number,
        yPositionOnFrom: number,
        xPositionOnTo: number,
        yPositionOnTo: number
      ) =>
        setState((s) =>
          layout.dragTile(
            s,
            from,
            to,
            xPositionOnFrom,
            yPositionOnFrom,
            xPositionOnTo,
            yPositionOnTo
          )
        ),
      [layout, setState]
    ),
    toggleFocus: useMemo(
      () =>
        layout.toggleFocus &&
        ((tile: TileDescriptor<T>) =>
          setState((s) => layout.toggleFocus!(s, tile))),
      [layout, setState]
    ),
    slots: <layout.Slots s={state} />,
  };
};

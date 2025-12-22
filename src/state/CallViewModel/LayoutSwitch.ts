/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  combineLatest,
  map,
  Subject,
  startWith,
  skipWhile,
  switchMap,
} from "rxjs";

import { type GridMode, type WindowMode } from "./CallViewModel.ts";
import { constant, type Behavior } from "../Behavior.ts";
import { type ObservableScope } from "../ObservableScope.ts";

/**
 * Creates a layout mode switch that allows switching between grid and spotlight modes.
 * The actual layout mode might switch automatically to spotlight if there is a
 * remote screen share active or if the window mode is flat.
 *
 * @param scope - The observable scope to manage subscriptions.
 * @param windowMode$ - The current window mode.
 * @param hasRemoteScreenShares$ - A behavior indicating if there are remote screen shares active.
 */
export function createLayoutModeSwitch(
  scope: ObservableScope,
  windowMode$: Behavior<WindowMode>,
  hasRemoteScreenShares$: Behavior<boolean>,
): {
  gridMode$: Behavior<GridMode>;
  setGridMode: (value: GridMode) => void;
} {
  const userSelection$ = new Subject<GridMode>();
  // Callback to set the grid mode desired by the user.
  // Notice that this is only a preference, the actual grid mode can be overridden
  // if there is a remote screen share active.
  const setGridMode = (value: GridMode): void => userSelection$.next(value);

  /**
   * The natural grid mode - the mode that the grid would prefer to be in,
   * not accounting for the user's manual selections.
   */
  const naturalGridMode$ = scope.behavior<GridMode>(
    combineLatest(
      [hasRemoteScreenShares$, windowMode$],
      (hasRemoteScreenShares, windowMode) =>
        // When there are screen shares or the window is flat (as with a phone
        // in landscape orientation), spotlight is a better experience.
        // We want screen shares to be big and readable, and we want flipping
        // your phone into landscape to be a quick way of maximising the
        // spotlight tile.
        hasRemoteScreenShares || windowMode === "flat" ? "spotlight" : "grid",
    ),
  );

  /**
   * The layout mode of the media tile grid.
   */
  const gridMode$ = scope.behavior<GridMode>(
    // Whenever the user makes a selection, we enter a new mode of behavior:
    userSelection$.pipe(
      map((selection) => {
        if (selection === "grid")
          // The user has selected grid mode. Start by respecting their choice,
          // but then follow the natural mode again as soon as it matches.
          return naturalGridMode$.pipe(
            skipWhile((naturalMode) => naturalMode !== selection),
            startWith(selection),
          );

        // The user has selected spotlight mode. If this matches the natural
        // mode, then follow the natural mode going forward.
        return selection === naturalGridMode$.value
          ? naturalGridMode$
          : constant(selection);
      }),
      // Initially the mode of behavior is to just follow the natural grid mode.
      startWith(naturalGridMode$),
      // Switch between each mode of behavior.
      switchMap((mode$) => mode$),
    ),
  );

  return {
    gridMode$,
    setGridMode,
  };
}

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
  switchAll,
} from "rxjs";

import { type WindowMode } from "./CallViewModel/CallViewModel.ts";
import { constant, type Behavior } from "./Behavior.ts";
import { type ObservableScope } from "./ObservableScope.ts";

export type LayoutMode = "spotlight" | "grid";

export interface LayoutSwitchViewModel {
  /**
   * The layout mode of the call's media tiles.
   */
  layout$: Behavior<LayoutMode>;
  setLayout: (value: LayoutMode) => void;
}

/**
 * Creates a layout mode switch that allows switching between grid and spotlight layouts.
 * The actual layout mode might switch automatically to spotlight if there is a
 * remote screen share active or if the window mode is flat.
 *
 * @param scope - The observable scope to manage subscriptions.
 * @param windowMode$ - The current window mode.
 * @param hasRemoteScreenShares$ - A behavior indicating if there are remote screen shares active.
 */
export function createLayoutSwitchViewModel(
  scope: ObservableScope,
  windowMode$: Behavior<WindowMode>,
  hasRemoteScreenShares$: Behavior<boolean>,
): LayoutSwitchViewModel {
  const userSelection$ = new Subject<LayoutMode>();
  // Callback to set the layout desired by the user.
  // Notice that this is only a preference, the actual layout can be overridden
  // if there is a remote screen share active.
  const setLayout = (value: LayoutMode): void => userSelection$.next(value);

  /**
   * The natural layout - the layout that the interface would prefer to be in,
   * not accounting for the user's manual selections.
   */
  const naturalLayout$ = scope.behavior<LayoutMode>(
    combineLatest(
      [hasRemoteScreenShares$, windowMode$],
      (hasRemoteScreenShares, windowMode) => {
        // When the window is flat (as with a phone in landscape orientation),
        // grid is preferable as there's usually more than enough horizontal
        // space to fit in some grid tiles on the side.
        if (windowMode === "flat") return "grid";
        // When there are screen shares, spotlight is a better experience. We
        // want them to be big and readable.
        return hasRemoteScreenShares ? "spotlight" : "grid";
      },
    ),
  );

  /**
   * The layout mode of the call's media tiles.
   */
  const layout$ = scope.behavior<LayoutMode>(
    // Whenever the user makes a selection, we enter a new mode of behavior:
    userSelection$.pipe(
      map((selection) => {
        if (selection === "grid")
          // The user has selected grid. Start by respecting their choice, but
          // then follow the natural mode again as soon as it matches.
          return naturalLayout$.pipe(
            skipWhile((naturalMode) => naturalMode !== selection),
            startWith(selection),
          );

        // The user has selected spotlight. If this matches the natural layout,
        // then follow the natural layout going forward.
        return selection === naturalLayout$.value
          ? naturalLayout$
          : constant(selection);
      }),
      // Initially the mode of behavior is to just follow the natural layout.
      startWith(naturalLayout$),
      // Switch between each mode of behavior.
      switchAll(),
    ),
  );

  return { layout$, setLayout };
}

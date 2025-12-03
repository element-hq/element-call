/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  BehaviorSubject,
  combineLatest,
  map,
  type Observable,
  scan,
} from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";

import { type GridMode, type WindowMode } from "./CallViewModel.ts";
import { type Behavior } from "../Behavior.ts";
import { type ObservableScope } from "../ObservableScope.ts";

/**
 * Creates a layout mode switch that allows switching between grid and spotlight modes.
 * The actual layout mode can be overridden to spotlight mode if there is a remote screen share active
 * or if the window mode is flat.
 *
 * @param scope - The observable scope to manage subscriptions.
 * @param windowMode$ - The current window mode observable.
 * @param hasRemoteScreenShares$ - An observable indicating if there are remote screen shares active.
 */
export function createLayoutModeSwitch(
  scope: ObservableScope,
  windowMode$: Behavior<WindowMode>,
  hasRemoteScreenShares$: Observable<boolean>,
): {
  gridMode$: Behavior<GridMode>;
  setGridMode: (value: GridMode) => void;
} {
  const gridModeUserSelection$ = new BehaviorSubject<GridMode>("grid");

  // Callback to set the grid mode desired by the user.
  // Notice that this is only a preference, the actual grid mode can be overridden
  // if there is a remote screen share active.
  const setGridMode = (value: GridMode): void => {
    gridModeUserSelection$.next(value);
  };
  /**
   * The layout mode of the media tile grid.
   */
  const gridMode$ =
    // If the user hasn't selected spotlight and somebody starts screen sharing,
    // automatically switch to spotlight mode and reset when screen sharing ends
    scope.behavior<GridMode>(
      combineLatest([
        gridModeUserSelection$,
        hasRemoteScreenShares$,
        windowMode$,
      ]).pipe(
        // Scan to keep track if we have auto-switched already or not.
        // To allow the user to override the auto-switch by selecting grid mode again.
        scan<
          [GridMode, boolean, WindowMode],
          { mode: GridMode; hasAutoSwitched: boolean }
        >(
          (acc, [userSelection, hasScreenShares, windowMode]) => {
            const isFlatMode = windowMode === "flat";

            // Always force spotlight in flat mode, grid layout is not supported
            // in that mode.
            // TODO: strange that we do that for flat mode but not for other modes?
            // TODO: Why is this not handled in layoutMedia$ like other window modes?
            if (isFlatMode) {
              logger.debug(`Forcing spotlight mode, windowMode=${windowMode}`);
              return {
                mode: "spotlight",
                hasAutoSwitched: acc.hasAutoSwitched,
              };
            }

            // User explicitly chose spotlight.
            // Respect that choice.
            if (userSelection === "spotlight") {
              return {
                mode: "spotlight",
                hasAutoSwitched: acc.hasAutoSwitched,
              };
            }

            // User has chosen grid mode. If a screen share starts, we will
            // auto-switch to spotlight mode for better experience.
            // But we only do it once, if the user switches back to grid mode,
            // we respect that choice until they explicitly change it again.
            if (hasScreenShares && !acc.hasAutoSwitched) {
              logger.debug(
                `Auto-switching to spotlight mode, hasScreenShares=${hasScreenShares}`,
              );
              return { mode: "spotlight", hasAutoSwitched: true };
            }

            // Respect user's grid choice
            // XXX If we want to forbid switching automatically again after we can
            // return hasAutoSwitched: acc.hasAutoSwitched here instead of setting to false.
            return { mode: "grid", hasAutoSwitched: false };
          },
          // initial value
          { mode: "grid", hasAutoSwitched: false },
        ),
        map(({ mode }) => mode),
      ),
      "grid",
    );

  return {
    gridMode$,
    setGridMode,
  };
}

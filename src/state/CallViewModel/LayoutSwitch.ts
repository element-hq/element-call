/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  BehaviorSubject,
  combineLatest,
  map,
  switchMap,
  type Observable,
  of,
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
      gridModeUserSelection$.pipe(
        switchMap((userSelection): Observable<GridMode> => {
          if (userSelection === "spotlight") {
            // If already in spotlight mode, stay there
            return of("spotlight");
          } else {
            // Otherwise, check if there is a remote screen share active
            // as this could force us into spotlight mode.
            return combineLatest([hasRemoteScreenShares$, windowMode$]).pipe(
              map(([hasScreenShares, windowMode]): GridMode => {
                // TODO: strange that we do that for flat mode but not for other modes?
                // TODO: Why is this not handled in layoutMedia$ like other window modes?
                const isFlatMode = windowMode === "flat";
                if (hasScreenShares || isFlatMode) {
                  logger.debug(
                    `Forcing spotlight mode, hasScreenShares=${hasScreenShares} windowMode=${windowMode}`,
                  );
                  // override to spotlight mode
                  return "spotlight";
                } else {
                  // respect user choice
                  return "grid";
                }
              }),
            );
          }
        }),
      ),
      "grid",
    );

  return {
    gridMode$,
    setGridMode,
  };
}

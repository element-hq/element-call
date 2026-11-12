/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { distinctUntilChanged, map, startWith, Subject } from "rxjs";

import { type Behavior } from "./Behavior";
import { type DragCallback, type Alignment, type Drag } from "./layout-types";
import { type ObservableScope } from "./ObservableScope";

/**
 * Represents a floating tile which may be dragged to different corners of the
 * call interface.
 */
export interface FloatingTile {
  alignment$: Behavior<Alignment>;
  onDrag: DragCallback;
}

export function createFloatingTile(
  scope: ObservableScope,
  defaultAlignment: Alignment,
): FloatingTile {
  const dragEvents$ = new Subject<Drag>();
  return {
    alignment$: scope.behavior(
      dragEvents$.pipe(
        map<Drag, Alignment>(({ xRatio, yRatio }) => ({
          inline: xRatio < 0.5 ? "start" : "end",
          block: yRatio < 0.5 ? "start" : "end",
        })),
        startWith(defaultAlignment),
        distinctUntilChanged(
          (a1, a2) => a1.inline === a2.inline && a1.block === a2.block,
        ),
      ),
    ),
    onDrag: (drag) => dragEvents$.next(drag),
  };
}

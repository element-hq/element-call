/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { ViewModel } from "./ViewModel";
import { type MediaViewModel, type UserMediaViewModel } from "./MediaViewModel";
import { type Behavior } from "./Behavior";

let nextId = 0;
function createId(): string {
  return (nextId++).toString();
}

export class GridTileViewModel extends ViewModel {
  public readonly id = createId();

  public constructor(public readonly media$: Behavior<UserMediaViewModel>) {
    super();
  }
}

export class SpotlightTileViewModel extends ViewModel {
  public constructor(
    public readonly media$: Behavior<MediaViewModel[]>,
    public readonly maximised$: Behavior<boolean>,
  ) {
    super();
  }
}

export type TileViewModel = GridTileViewModel | SpotlightTileViewModel;

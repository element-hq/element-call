/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { BehaviorSubject, Observable, of } from "rxjs";

import { ViewModel } from "./ViewModel";
import { MediaViewModel, UserMediaViewModel } from "./MediaViewModel";

export class GridTileViewModel extends ViewModel {
  private readonly visible_ = new BehaviorSubject(false)
  /**
   * Whether the tile is visible within the current viewport.
   */
  public readonly visible: Observable<boolean> = this.visible_

  public setVisible(value: boolean): void {
    this.visible_.next(value)
  }

  public constructor(
    public readonly media: UserMediaViewModel,
  ) {
    super()
  }
}

export class SpotlightTileViewModel extends ViewModel {
  public constructor(
    public readonly media: MediaViewModel[],
    // TODO: Remove the default value
    public readonly maximised: Observable<boolean> = of(false),
  ) {
    super()
  }
}

export type TileViewModel = GridTileViewModel | SpotlightTileViewModel

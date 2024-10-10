/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { BehaviorSubject, Observable } from "rxjs";

import { ViewModel } from "./ViewModel";
import { MediaViewModel, UserMediaViewModel } from "./MediaViewModel";

let nextId = 0;
function createId(): string {
  return (nextId++).toString();
}

export class GridTileViewModel extends ViewModel {
  public readonly id = createId();

  private readonly visible_ = new BehaviorSubject(false);
  /**
   * Whether the tile is visible within the current viewport.
   */
  public readonly visible: Observable<boolean> = this.visible_;

  public setVisible(value: boolean): void {
    this.visible_.next(value);
  }

  public constructor(public readonly media: Observable<UserMediaViewModel>) {
    super();
  }
}

export class SpotlightTileViewModel extends ViewModel {
  public constructor(
    public readonly media: Observable<MediaViewModel[]>,
    public readonly maximised: Observable<boolean>,
  ) {
    super();
  }
}

export type TileViewModel = GridTileViewModel | SpotlightTileViewModel;

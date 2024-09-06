/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { ObservableScope } from "./ObservableScope";

/**
 * An MVVM view model.
 */
export abstract class ViewModel {
  protected readonly scope = new ObservableScope();

  /**
   * Instructs the ViewModel to clean up its resources. If you forget to call
   * this, there may be memory leaks!
   */
  public destroy(): void {
    this.scope.end();
  }
}

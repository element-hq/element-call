/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Observable, Subject, takeUntil } from "rxjs";

type MonoTypeOperator = <T>(o: Observable<T>) => Observable<T>;

/**
 * A scope which limits the execution lifetime of its bound Observables.
 */
export class ObservableScope {
  private readonly ended$ = new Subject<void>();

  private readonly bindImpl: MonoTypeOperator = takeUntil(this.ended$);

  /**
   * Binds an Observable to this scope, so that it completes when the scope
   * ends.
   */
  public bind(): MonoTypeOperator {
    return this.bindImpl;
  }

  /**
   * Ends the scope, causing any bound Observables to complete.
   */
  public end(): void {
    this.ended$.next();
    this.ended$.complete();
  }
}

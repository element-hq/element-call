/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import {
  distinctUntilChanged,
  Observable,
  shareReplay,
  Subject,
  takeUntil,
} from "rxjs";

type MonoTypeOperator = <T>(o: Observable<T>) => Observable<T>;

/**
 * A scope which limits the execution lifetime of its bound Observables.
 */
export class ObservableScope {
  private readonly ended = new Subject<void>();

  private readonly bindImpl: MonoTypeOperator = takeUntil(this.ended);

  /**
   * Binds an Observable to this scope, so that it completes when the scope
   * ends.
   */
  public bind(): MonoTypeOperator {
    return this.bindImpl;
  }

  private readonly stateImpl: MonoTypeOperator = (o) =>
    o.pipe(this.bind(), distinctUntilChanged(), shareReplay(1));

  /**
   * Transforms an Observable into a hot state Observable which replays its
   * latest value upon subscription, skips updates with identical values, and
   * is bound to this scope.
   */
  public state(): MonoTypeOperator {
    return this.stateImpl;
  }

  /**
   * Ends the scope, causing any bound Observables to complete.
   */
  public end(): void {
    this.ended.next();
    this.ended.complete();
  }
}

/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  BehaviorSubject,
  distinctUntilChanged,
  type Observable,
  share,
  Subject,
  takeUntil,
} from "rxjs";

import { type Behavior } from "./Behavior";

type MonoTypeOperator = <T>(o: Observable<T>) => Observable<T>;

const nothing = Symbol("nothing");

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

  private readonly shareImpl: MonoTypeOperator = share({
    resetOnError: false,
    resetOnComplete: false,
    resetOnRefCountZero: false,
  });
  /**
   * Shares (multicasts) the Observable as a hot Observable.
   */
  public readonly share: MonoTypeOperator = (input$) =>
    input$.pipe(this.bindImpl, this.shareImpl);

  /**
   * Converts an Observable to a Behavior. If no initial value is specified, the
   * Observable must synchronously emit an initial value.
   */
  public behavior<T>(
    setValue$: Observable<T>,
    initialValue: T | typeof nothing = nothing,
  ): Behavior<T> {
    const subject$ = new BehaviorSubject(initialValue);
    // Push values from the Observable into the BehaviorSubject.
    // BehaviorSubjects have an undesirable feature where if you call 'complete',
    // they will no longer re-emit their current value upon subscription. We want
    // to support Observables that complete (for example `of({})`), so we have to
    // take care to not propagate the completion event.
    setValue$.pipe(this.bind(), distinctUntilChanged()).subscribe({
      next(value) {
        subject$.next(value);
      },
      error(err: unknown) {
        subject$.error(err);
      },
    });
    if (subject$.value === nothing)
      throw new Error("Behavior failed to synchronously emit an initial value");
    return subject$ as Behavior<T>;
  }

  /**
   * Ends the scope, causing any bound Observables to complete.
   */
  public end(): void {
    this.ended$.next();
    this.ended$.complete();
  }

  /**
   * Register a callback to be executed when the scope is ended.
   */
  public onEnd(callback: () => void): void {
    this.ended$.subscribe(callback);
  }
}

/**
 * The global scope, a scope which never ends.
 */
export const globalScope = new ObservableScope();

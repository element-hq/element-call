/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  BehaviorSubject,
  catchError,
  distinctUntilChanged,
  EMPTY,
  endWith,
  filter,
  type Observable,
  share,
  take,
  takeUntil,
} from "rxjs";

import { type Behavior } from "./Behavior";

type MonoTypeOperator = <T>(o: Observable<T>) => Observable<T>;

const nothing = Symbol("nothing");

/**
 * A scope which limits the execution lifetime of its bound Observables.
 */
export class ObservableScope {
  private readonly ended$ = new BehaviorSubject(false);

  private readonly bindImpl: MonoTypeOperator = takeUntil(
    this.ended$.pipe(filter((ended) => ended)),
  );

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
    this.ended$.next(true);
  }

  /**
   * Register a callback to be executed when the scope is ended.
   */
  public onEnd(callback: () => void): void {
    this.ended$
      .pipe(
        filter((ended) => ended),
        take(1),
      )
      .subscribe(callback);
  }

  /**
   * For the duration of the scope, sync some external state with the value of
   * the provided Behavior by way of an async function which attempts to update
   * (reconcile) the external state. The reconciliation function may return a
   * clean-up callback which will be called and awaited before the next change
   * in value (or the end of the scope).
   *
   * All calls to the function and its clean-up callbacks are serialized. If the
   * value changes faster than the handlers can keep up with, intermediate
   * values may be skipped.
   *
   * Basically, this is like React's useEffect but async and for Behaviors.
   */
  public reconcile<T>(
    value$: Behavior<T>,
    callback: (value: T) => Promise<(() => Promise<void>) | void>,
  ): void {
    let latestValue: T | typeof nothing = nothing;
    let reconciledValue: T | typeof nothing = nothing;
    let cleanUp: (() => Promise<void>) | void = undefined;
    value$
      .pipe(
        catchError(() => EMPTY), // Ignore errors
        this.bind(), // Limit to the duration of the scope
        endWith(nothing), // Clean up when the scope ends
      )
      .subscribe((value) => {
        void (async (): Promise<void> => {
          if (latestValue === nothing) {
            latestValue = value;
            while (latestValue !== reconciledValue) {
              await cleanUp?.(); // Call the previous value's clean-up handler
              reconciledValue = latestValue;
              if (latestValue !== nothing)
                cleanUp = await callback(latestValue); // Sync current value
            }
            // Reset to signal that reconciliation is done for now
            latestValue = nothing;
          } else {
            // There's already an instance of the above 'while' loop running
            // concurrently. Just update the latest value and let it be handled.
            latestValue = value;
          }
        })();
      });
  }
}

/**
 * The global scope, a scope which never ends.
 */
export const globalScope = new ObservableScope();

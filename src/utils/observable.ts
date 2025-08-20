/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type Observable,
  combineLatest,
  concat,
  defer,
  finalize,
  map,
  scan,
  startWith,
  takeWhile,
  tap,
} from "rxjs";

const nothing = Symbol("nothing");

/**
 * RxJS operator that invokes a callback when the Observable is finalized,
 * passing the most recently emitted value. If no value was emitted, the
 * callback will not be invoked.
 */
export function finalizeValue<T>(callback: (finalValue: T) => void) {
  return (source$: Observable<T>): Observable<T> =>
    defer(() => {
      let finalValue: T | typeof nothing = nothing;
      return source$.pipe(
        tap((value) => (finalValue = value)),
        finalize(() => {
          if (finalValue !== nothing) callback(finalValue);
        }),
      );
    });
}

/**
 * RxJS operator that accumulates a state from a source of events. This is like
 * scan, except it emits an initial value immediately before any events arrive.
 */
export function accumulate<State, Event>(
  initial: State,
  update: (state: State, event: Event) => State,
) {
  return (events$: Observable<Event>): Observable<State> =>
    events$.pipe(scan(update, initial), startWith(initial));
}

const switchSymbol = Symbol("switch");

/**
 * RxJS operator which behaves like the input Observable (A) until it emits a
 * value satisfying the given predicate, then behaves like Observable B.
 *
 * The switch is immediate; the value that triggers the switch will not be
 * present in the output.
 */
export function switchWhen<A, B>(
  predicate: (a: A, index: number) => boolean,
  b$: Observable<B>,
) {
  return (a$: Observable<A>): Observable<A | B> =>
    concat(
      a$.pipe(
        map((a, index) => (predicate(a, index) ? switchSymbol : a)),
        takeWhile((a) => a !== switchSymbol),
      ) as Observable<A>,
      b$,
    );
}

/**
 * Reads the current value of a state Observable without reacting to future
 * changes.
 *
 * This function exists to help with certain cases of bridging Observables into
 * React, where an initial value is needed. You should never use it to create an
 * Observable derived from another Observable; use reactive operators instead.
 */
export function getValue<T>(state$: Observable<T>): T {
  let value: T | typeof nothing = nothing;
  state$.subscribe((x) => (value = x)).unsubscribe();
  if (value === nothing) throw new Error("Not a state Observable");
  return value;
}

/**
 * Creates an Observable that has a value of true whenever all its inputs are
 * true.
 */
export function and$(...inputs: Observable<boolean>[]): Observable<boolean> {
  return combineLatest(inputs, (...flags) => flags.every((flag) => flag));
}

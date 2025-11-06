/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type Observable,
  audit,
  combineLatest,
  concat,
  defer,
  filter,
  finalize,
  map,
  of,
  scan,
  startWith,
  takeWhile,
  tap,
  withLatestFrom,
  BehaviorSubject,
} from "rxjs";

import { type Behavior } from "../state/Behavior";
import { ObservableScope } from "../state/ObservableScope";

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

/**
 * RxJS operator that pauses all changes in the input value whenever a Behavior
 * is true. When the Behavior returns to being false, the most recently
 * suppressed change is emitted as the most recent value.
 */
export function pauseWhen<T>(pause$: Behavior<boolean>) {
  return (value$: Observable<T>): Observable<T> =>
    value$.pipe(
      withLatestFrom(pause$),
      audit(([, pause]) =>
        pause ? pause$.pipe(filter((pause) => !pause)) : of(null),
      ),
      map(([value]) => value),
    );
}

/**
 * Maps a changing input value to a collection of items that each capture some
 * dynamic data and are tied to a key. Items will be automatically created when
 * their key is requested for the first time, reused when the same key is
 * requested acy later time, and destroyed (have their scope ended) when the key
 * is no longer requested.
 *
 * @param input$ The input value to be mapped.
 * @param generator A generator function yielding a key and the currently
 *   associated data for each item that it wants to exist.
 * @param factory A function constructing an actual item, given the item's key,
 *   dynamic data, and an automatically managed ObservableScope for the item.
 */
export function generateItems$<Input, Key, Data, Item>(
  input$: Observable<Input>,
  generator: (input: Input) => Generator<{ key: Key; data: Data }, void, void>,
  factory: (scope: ObservableScope, key: Key, data$: Behavior<Data>) => Item,
): Observable<Item[]> {
  return input$.pipe(
    // Keep track of the existing items over time, so we can reuse them
    scan((prevItems, input) => {
      const nextItems = new Map<
        Key,
        { scope: ObservableScope; data$: BehaviorSubject<Data>; item: Item }
      >();

      for (const { key, data } of generator(input)) {
        let item = prevItems.get(key);
        if (item === undefined) {
          // First time requesting the key; create the item
          const scope = new ObservableScope();
          const data$ = new BehaviorSubject(data);
          item = { scope, data$, item: factory(scope, key, data$) };
        } else {
          item.data$.next(data);
        }
        nextItems.set(key, item);
      }

      // Destroy all items that are no longer being requested
      for (const [key, { scope }] of prevItems)
        if (!nextItems.has(key)) scope.end();

      return nextItems;
    }, new Map<Key, { scope: ObservableScope; data$: BehaviorSubject<Data>; item: Item }>()),
    finalizeValue((items) => {
      // Destroy all remaining items when no longer subscribed
      for (const { scope } of items.values()) scope.end();
    }),
    map((items) => [...items.values()].map(({ item }) => item)),
  );
}

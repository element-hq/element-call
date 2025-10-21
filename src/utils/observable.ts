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
 * Maps a changing input value to an output value consisting of items that have
 * automatically generated ObservableScopes tied to a key. Items will be
 * automatically created when their key is requested for the first time, reused
 * when the same key is requested at a later time, and destroyed (have their
 * scope ended) when the key is no longer requested.
 *
 * @param input$ The input value to be mapped.
 * @param project A function mapping input values to output values. This
 *   function receives an additional callback `createOrGet` which can be used
 *   within the function body to request that an item be generated for a certain
 *   key. The caller provides a factory which will be used to create the item if
 *   it is being requested for the first time. Otherwise, the item previously
 *   existing under that key will be returned.
 */
export function generateKeyed$<In, Item, Out>(
  input$: Observable<In>,
  project: (
    input: In,
    createOrGet: (
      key: string,
      factory: (scope: ObservableScope) => Item,
    ) => Item,
  ) => Out,
): Observable<Out> {
  return input$.pipe(
    // Keep track of the existing items over time, so we can reuse them
    scan<
      In,
      {
        items: Map<string, { item: Item; scope: ObservableScope }>;
        output: Out;
      },
      { items: Map<string, { item: Item; scope: ObservableScope }> }
    >(
      (state, data) => {
        const nextItems = new Map<
          string,
          { item: Item; scope: ObservableScope }
        >();

        const output = project(data, (key, factory) => {
          let item = state.items.get(key);
          if (item === undefined) {
            // First time requesting the key; create the item
            const scope = new ObservableScope();
            item = { item: factory(scope), scope };
          }
          nextItems.set(key, item);
          return item.item;
        });

        // Destroy all items that are no longer being requested
        for (const [key, { scope }] of state.items)
          if (!nextItems.has(key)) scope.end();

        return { items: nextItems, output };
      },
      { items: new Map() },
    ),
    finalizeValue((state) => {
      // Destroy all remaining items when no longer subscribed
      for (const { scope } of state.items.values()) scope.end();
    }),
    map(({ output }) => output),
  );
}

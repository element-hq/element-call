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
  type OperatorFunction,
  distinctUntilChanged,
} from "rxjs";

import { type Behavior } from "../state/Behavior";
import { Epoch, ObservableScope } from "../state/ObservableScope";

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

interface ItemHandle<Data, Item> {
  scope: ObservableScope;
  data$: BehaviorSubject<Data>;
  item: Item;
}

/**
 * Maps a changing input value to a collection of items that each capture some
 * dynamic data and are tied to a key. Items will be automatically created when
 * their key is requested for the first time, reused when the same key is
 * requested at a later time, and destroyed (have their scope ended) when the
 * key is no longer requested.
 *
 * @param input$ The input value to be mapped.
 * @param generator A generator function yielding a tuple of keys and the
 *   currently associated data for each item that it wants to exist.
 * @param factory A function constructing an individual item, given the item's key,
 *   dynamic data, and an automatically managed ObservableScope for the item.
 */
export function generateItems<
  Input,
  Keys extends [unknown, ...unknown[]],
  Data,
  Item,
>(
  generator: (
    input: Input,
  ) => Generator<{ keys: readonly [...Keys]; data: Data }, void, void>,
  factory: (
    scope: ObservableScope,
    data$: Behavior<Data>,
    ...keys: Keys
  ) => Item,
): OperatorFunction<Input, Item[]> {
  return generateItemsInternal(generator, factory, (items) => items);
}

/**
 * Same as generateItems, but preserves epoch data.
 */
export function generateItemsWithEpoch<
  Input,
  Keys extends [unknown, ...unknown[]],
  Data,
  Item,
>(
  generator: (
    input: Input,
  ) => Generator<{ keys: readonly [...Keys]; data: Data }, void, void>,
  factory: (
    scope: ObservableScope,
    data$: Behavior<Data>,
    ...keys: Keys
  ) => Item,
): OperatorFunction<Epoch<Input>, Epoch<Item[]>> {
  return generateItemsInternal(
    function* (input) {
      yield* generator(input.value);
    },
    factory,
    (items, input) => new Epoch(items, input.epoch),
  );
}

/**
 * Segments a behavior into periods during which its value matches the filter
 * (outputting a behavior with a narrowed type) and periods during which it does
 * not match (outputting null).
 */
export function filterBehavior<T, S extends T>(
  predicate: (value: T) => value is S,
): OperatorFunction<T, Behavior<S> | null> {
  return (input$) =>
    input$.pipe(
      scan<T, BehaviorSubject<S> | null>((acc$, input) => {
        if (predicate(input)) {
          const output$ = acc$ ?? new BehaviorSubject(input);
          output$.next(input);
          return output$;
        }
        return null;
      }, null),
      distinctUntilChanged(),
    );
}

function generateItemsInternal<
  Input,
  Keys extends [unknown, ...unknown[]],
  Data,
  Item,
  Output,
>(
  generator: (
    input: Input,
  ) => Generator<{ keys: readonly [...Keys]; data: Data }, void, void>,
  factory: (
    scope: ObservableScope,
    data$: Behavior<Data>,
    ...keys: Keys
  ) => Item,
  project: (items: Item[], input: Input) => Output,
): OperatorFunction<Input, Output> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return (input$) =>
    input$.pipe(
      // Keep track of the existing items over time, so they can persist
      scan<
        Input,
        {
          map: Map<any, any>;
          items: Set<ItemHandle<Data, Item>>;
          input: Input;
        },
        { map: Map<any, any>; items: Set<ItemHandle<Data, Item>> }
      >(
        ({ map: prevMap, items: prevItems }, input) => {
          const nextMap = new Map();
          const nextItems = new Set<ItemHandle<Data, Item>>();

          for (const { keys, data } of generator(input)) {
            // Disable type checks for a second to grab the item out of a nested map
            let i: any = prevMap;
            for (const key of keys) i = i?.get(key);
            let item = i as ItemHandle<Data, Item> | undefined;

            if (item === undefined) {
              // First time requesting the key; create the item
              const scope = new ObservableScope();
              const data$ = new BehaviorSubject(data);
              item = { scope, data$, item: factory(scope, data$, ...keys) };
            } else {
              item.data$.next(data);
            }

            // Likewise, disable type checks to insert the item in the nested map
            let m: Map<any, any> = nextMap;
            for (let i = 0; i < keys.length - 1; i++) {
              let inner = m.get(keys[i]);
              if (inner === undefined) {
                inner = new Map();
                m.set(keys[i], inner);
              }
              m = inner;
            }
            const finalKey = keys[keys.length - 1];
            if (m.has(finalKey))
              throw new Error(
                `Keys must be unique (tried to generate multiple items for key ${keys})`,
              );
            m.set(keys[keys.length - 1], item);
            nextItems.add(item);
          }

          // Destroy all items that are no longer being requested
          for (const item of prevItems)
            if (!nextItems.has(item)) item.scope.end();

          return { map: nextMap, items: nextItems, input };
        },
        { map: new Map(), items: new Set() },
      ),
      finalizeValue(({ items }) => {
        // Destroy all remaining items when no longer subscribed
        for (const { scope } of items) scope.end();
      }),
      map(({ items, input }) =>
        project(
          [...items].map(({ item }) => item),
          input,
        ),
      ),
    );
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

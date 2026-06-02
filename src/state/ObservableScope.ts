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
  map,
  type Observable,
  type OperatorFunction,
  share,
  take,
  takeUntil,
} from "rxjs";

import { type Behavior } from "./Behavior";

type MonoTypeOperator = <T>(o: Observable<T>) => Observable<T>;

type SplitBehavior<T> = keyof T extends string | number
  ? { [K in keyof T as `${K}$`]: Behavior<T[K]> }
  : never;

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
    let reconcilePromise: Promise<void> | undefined = undefined;
    let cleanUp: (() => Promise<void>) | void = undefined;
    let prevVal: T | typeof nothing = nothing;

    // While this loop runs it will process the latest from `value$` until it caught up with the updates.
    // It might skip updates from `value$` and only process the newest value after callback has resolved.
    const reconcileLoop = async (): Promise<void> => {
      while (latestValue !== prevVal) {
        await cleanUp?.(); // Call the previous value's clean-up handler
        prevVal = latestValue;

        if (latestValue !== nothing) cleanUp = await callback(latestValue); // Sync current value...
        // `latestValue` might have gotten updated during the `await callback`. That is why we loop here
      }
    };

    value$
      .pipe(
        catchError(() => EMPTY), // Ignore errors
        this.bind(), // Limit to the duration of the scope
        endWith(nothing), // Clean up when the scope ends
      )
      .subscribe((value) => {
        // Always track the latest value! The `reconcileLoop` will run until it "processed" the "last" `latestValue`.
        latestValue = value;
        // There's already an instance of the below 'reconcileLoop' loop running
        // concurrently. So lets let the loop handle it. NEVER instanciate two `reconcileLoop`s.
        if (reconcilePromise) return;

        reconcilePromise = reconcileLoop().finally(() => {
          reconcilePromise = undefined;
        });
      });
  }

  /**
   * Splits a Behavior of objects with static properties into an object with
   * Behavior properties.
   *
   * For example, splitting a `Behavior<{ name: string; age: number }>` results
   * in an object of type `{ name$: Behavior<string>; age$: Behavior<number> }`.
   */
  public splitBehavior<T extends object>(
    input$: Behavior<T>,
  ): SplitBehavior<T> {
    return Object.fromEntries(
      Object.keys(input$.value).map((key) => [
        `${key}$`,
        this.behavior(input$.pipe(map((input) => input[key as keyof T]))),
      ]),
    ) as SplitBehavior<T>;
  }
}

/**
 * The global scope, a scope which never ends.
 */
export const globalScope = new ObservableScope();

/**
 * `Epoch`'s can be used to create `Behavior`s and `Observable`s which derivitives can be merged
 * with `combinedLatest` without duplicated emissions.
 *
 * This is useful in the following example:
 * ```
 * const rootObs$ = of("red","green","blue");
 * const derivedObs$ = rootObs$.pipe(
 *   map((v)=> {red:"fire", green:"grass", blue:"water"}[v])
 * );
 * const otherDerivedObs$ = rootObs$.pipe(
 *   map((v)=> {red:"tomatoes", green:"leaves", blue:"sky"}[v])
 * );
 * const mergedObs$ = combineLatest([rootObs$, derivedObs$, otherDerivedObs$]).pipe(
 *   map(([color, a,b]) => color + " like " + a + " and " + b)
 * );
 *
 * ```
 * will result in 6 emissions with mismatching items like "red like fire and leaves"
 *
 * # Use Epoch
 * ```
 * const ancestorObs$ = of(1,2,3).pipe(trackEpoch());
 * const derivedObs$ = ancestorObs$.pipe(
 *   mapEpoch((v)=> "this number: " + v)
 * );
 * const otherDerivedObs$ = ancestorObs$.pipe(
 *   mapEpoch((v)=> "multiplied by: " + v)
 * );
 * const mergedObs$ = combineLatest([derivedObs$, otherDerivedObs$]).pipe(
 *   filter((values) => values.every((v) => v.epoch === values[0].v)),
 *   map(([color, a, b]) => color + " like " + a + " and " + b)
 * );
 *
 * ```
 * will result in 3 emissions all matching (e.g. "blue like water and sky")
 */
export class Epoch<T> {
  public readonly epoch: number;
  public readonly value: T;

  public constructor(value: T, epoch?: number) {
    this.value = value;
    this.epoch = epoch ?? 0;
  }
  /**
   * Maps the value inside the epoch to a new value while keeping the epoch number.
   * # usage
   * ```
   * const myEpoch$ = myObservable$.pipe(
   *   map(trackEpoch()),
   *   // this is the preferred way using mapEpoch
   *   mapEpoch((v)=> v+1)
   *   // This is how inner map can be used:
   *   map((epoch) => epoch.innerMap((v)=> v+1))
   *   // It is equivalent to:
   *   map((epoch) => new Epoch(epoch.value + 1, epoch.epoch))
   * )
   * ```
   * See also `Epoch<T>`
   */
  public mapInner<U>(map: (value: T) => U): Epoch<U> {
    return new Epoch<U>(map(this.value), this.epoch);
  }
}

/**
 * A `pipe` compatible map oparator that keeps the epoch in tact but allows mapping the value.
 * # usage
 * ```
 * const myEpoch$ = myObservable$.pipe(
 *   map(trackEpoch()),
 *   // this is the preferred way using mapEpoch
 *   mapEpoch((v)=> v+1)
 *   // This is how inner map can be used:
 *   map((epoch) => epoch.innerMap((v)=> v+1))
 *   // It is equivalent to:
 *   map((epoch) => new Epoch(epoch.value + 1, epoch.epoch))
 * )
 * ```
 * See also `Epoch<T>`
 */
export function mapEpoch<T, U>(
  mapFn: (value: T) => U,
): OperatorFunction<Epoch<T>, Epoch<U>> {
  return map((e) => e.mapInner(mapFn));
}

/**
 * # usage
 * ```
 * const myEpoch$ = myObservable$.pipe(
 *   map(trackEpoch()),
 *   map((epoch) => epoch.innerMap((v)=> v+1))
 * )
 * const derived = myEpoch$.pipe(
 *   mapEpoch((v)=>v^2)
 * )
 * ```
 * See also `Epoch<T>`
 */
export function trackEpoch<T>(): OperatorFunction<T, Epoch<T>> {
  return map<T, Epoch<T>>((value, number) => new Epoch(value, number));
}

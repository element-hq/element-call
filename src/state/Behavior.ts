/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BehaviorSubject, distinctUntilChanged, Observable } from "rxjs";

import { type ObservableScope } from "./ObservableScope";

/**
 * A stateful, read-only reactive value. As an Observable, it is "hot" and
 * always replays the current value upon subscription.
 *
 * A Behavior is to BehaviorSubject what Observable is to Subject; it does not
 * provide a way to imperatively set new values. For more info on the
 * distinction between Behaviors and Observables, see
 * https://monoid.dk/post/behaviors-and-streams-why-both/.
 */
export type Behavior<T> = Omit<BehaviorSubject<T>, "next" | "observers">;

/**
 * Creates a Behavior which never changes in value.
 */
export function constant<T>(value: T): Behavior<T> {
  return new BehaviorSubject(value);
}

declare module "rxjs" {
  interface Observable<T> {
    /**
     * Converts this Observable into a Behavior. This requires the Observable to
     * synchronously emit an initial value.
     */
    behavior(scope: ObservableScope): Behavior<T>;
  }
}

const nothing = Symbol("nothing");

Observable.prototype.behavior = function <T>(
  this: Observable<T>,
  scope: ObservableScope,
): Behavior<T> {
  const subject$ = new BehaviorSubject<T | typeof nothing>(nothing);
  // Push values from the Observable into the BehaviorSubject.
  // BehaviorSubjects have an undesirable feature where if you call 'complete',
  // they will no longer re-emit their current value upon subscription. We want
  // to support Observables that complete (for example `of({})`), so we have to
  // take care to not propagate the completion event.
  this.pipe(scope.bind(), distinctUntilChanged()).subscribe({
    next(value) {
      subject$.next(value);
    },
    error(err) {
      subject$.error(err);
    },
  });
  if (subject$.value === nothing)
    throw new Error("Behavior failed to synchronously emit an initial value");
  return subject$ as Behavior<T>;
};

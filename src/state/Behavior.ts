/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BehaviorSubject, Observable } from "rxjs";

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
  // Push values from the Observable into the BehaviorSubject
  this.pipe(scope.bind()).subscribe(subject$);
  if (subject$.value === nothing)
    throw new Error("Behavior failed to synchronously emit an initial value");
  return subject$ as Behavior<T>;
};

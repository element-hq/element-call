/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { catchError, from, map, type Observable, of, startWith } from "rxjs";

/**
 * Data that may need to be loaded asynchronously.
 *
 * This type is for when you need to represent the current state of an operation
 * involving Promises as **immutable data**. See the async$ function below.
 */
export type Async<A> =
  | { state: "loading" }
  | { state: "error"; value: Error }
  | { state: "ready"; value: A };

export const loading: Async<never> = { state: "loading" };
export function error(value: Error): Async<never> {
  return { state: "error", value };
}

export function ready<A>(value: A): Async<A> {
  return { state: "ready", value };
}

/**
 * Turn a Promise into an Observable async value. The Observable will have the
 * value "loading" while the Promise is pending, "ready" when the Promise
 * resolves, and "error" when the Promise rejects.
 */
export function async$<A>(promise: Promise<A>): Observable<Async<A>> {
  return from(promise).pipe(
    map(ready),
    startWith(loading),
    catchError((e: unknown) =>
      of(error((e as Error) ?? new Error("Unknown error"))),
    ),
  );
}

/**
 * If the async value is ready, apply the given function to the inner value.
 */
export function mapAsync<A, B>(
  async: Async<A>,
  project: (value: A) => B,
): Async<B> {
  return async.state === "ready" ? ready(project(async.value)) : async;
}

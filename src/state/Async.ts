/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  catchError,
  from,
  map,
  type Observable,
  of,
  startWith
} from "rxjs";

// TODO where are all the comments? ::cry::
// There used to be an unitialized state!, a state might not start in loading
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

export function async$<A>(promise: Promise<A>): Observable<Async<A>> {
  return from(promise).pipe(
    map(ready),
    startWith(loading),
    catchError((e: unknown) => of(error(e as Error ?? new Error("Unknown error")))),
  );
}

export function mapAsync<A, B>(
  async: Async<A>,
  project: (value: A) => B
): Async<B> {
  return async.state === "ready" ? ready(project(async.value)) : async;
}

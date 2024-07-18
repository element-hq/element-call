/*
Copyright 2023 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { Observable, defer, finalize, scan, startWith, tap } from "rxjs";

const nothing = Symbol("nothing");

/**
 * RxJS operator that invokes a callback when the Observable is finalized,
 * passing the most recently emitted value. If no value was emitted, the
 * callback will not be invoked.
 */
export function finalizeValue<T>(callback: (finalValue: T) => void) {
  return (source: Observable<T>): Observable<T> =>
    defer(() => {
      let finalValue: T | typeof nothing = nothing;
      return source.pipe(
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
  return (events: Observable<Event>): Observable<State> =>
    events.pipe(scan(update, initial), startWith(initial));
}

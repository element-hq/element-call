/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Observable, of, switchMap } from "rxjs";

import { type Behavior } from "../../../src/state/Behavior";
import { ObservableScope } from "../../../src/state/ObservableScope";

/**
 * Builds one item per present value of a behavior, each in a scope of its own
 * that ends when the value changes or the outer scope ends. The item for a
 * null or undefined value is undefined.
 */
export function mapScoped<T, Item>(
  scope: ObservableScope,
  source$: Behavior<T | null | undefined>,
  factory: (scope: ObservableScope, value: T) => Item,
): Behavior<Item | undefined> {
  return scope.behavior(
    source$.pipe(
      switchMap((value) => {
        if (value === null || value === undefined) return of(undefined);
        return new Observable<Item>((subscriber) => {
          const itemScope = new ObservableScope();
          subscriber.next(factory(itemScope, value));
          return (): void => itemScope.end();
        });
      }),
    ),
  );
}

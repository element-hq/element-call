/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Observable } from "rxjs";

import { type Behavior } from "../state/Behavior";
import { type ObservableScope } from "../state/ObservableScope";
import { type Unsubscribe } from "./ElementCallMatrixClientDriver";

/**
 * Turns one of a driver's `get` / `subscribe` pairs into a behavior owned by
 * `scope`: the current value now, every change until the scope ends.
 */
export function observeDriver<T>(
  scope: ObservableScope,
  get: () => T,
  subscribe: (listener: (value: T) => void) => Unsubscribe,
): Behavior<T> {
  return scope.behavior(
    new Observable<T>((subscriber) =>
      subscribe((value) => subscriber.next(value)),
    ),
    get(),
  );
}

/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect } from "react";
import { BehaviorSubject } from "rxjs";

import { type Behavior } from "./state/Behavior";
import { useInitial } from "./useInitial";

/**
 * React hook which mirrors a value from the render cycle into a behavior, so
 * that a prop or memoised value can be handed to a view model. The behavior
 * takes each new value once the render that produced it has committed.
 */
export function useValueBehavior<T>(value: T): Behavior<T> {
  const value$ = useInitial(() => new BehaviorSubject(value));
  useEffect(() => {
    value$.next(value);
  }, [value$, value]);
  return value$;
}

/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect, useState } from "react";

import { type Behavior } from "./state/Behavior";

interface Read<T> {
  behavior: Behavior<T>;
  value: T;
}

/**
 * React hook which reactively reads the value of a behavior.
 *
 * A plain subscription rather than `useSyncExternalStore`: the React Compiler
 * memoizes a snapshot getter `() => behavior.value` on the value rather than
 * the behavior, so a view switching to a behavior that starts on the same
 * value (a view model arriving after the first render) kept reading the old
 * one, and React saw no change in the new one's emissions.
 */
export function useBehavior<T>(behavior: Behavior<T>): T {
  const [read, setRead] = useState<Read<T>>(() => ({
    behavior,
    value: behavior.value,
  }));
  useEffect(() => {
    const subscription = behavior.subscribe((value) => {
      // By value alone: a behavior built during the render is new every
      // time, and adopting it for the same value would render forever
      setRead((current) =>
        Object.is(current.value, value) ? current : { behavior, value },
      );
    });
    return (): void => subscription.unsubscribe();
  }, [behavior]);
  // Until the subscription to a new behavior is in place, read it directly
  return read.behavior === behavior ? read.value : behavior.value;
}

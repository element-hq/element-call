/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useCallback, useSyncExternalStore } from "react";

import { type Behavior } from "./state/Behavior";

/**
 * React hook which reactively reads the value of a behavior.
 */
export function useBehavior<T>(behavior: Behavior<T>): T {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const s = behavior.subscribe(onChange);
      return (): void => s.unsubscribe();
    },
    [behavior],
  );
  const getValue = useCallback(() => behavior.value, [behavior]);
  return useSyncExternalStore(subscribe, getValue);
}

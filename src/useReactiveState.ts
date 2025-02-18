/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type DependencyList,
  type Dispatch,
  type SetStateAction,
  useCallback,
  useRef,
  useState,
} from "react";

/**
 * Hook creating a stateful value that updates automatically whenever the
 * dependencies change. Or equivalently, a version of useMemo that takes its own
 * previous value as an input, and can be updated manually.
 */
export const useReactiveState = <T>(
  updateFn: (prevState?: T) => T,
  deps: DependencyList,
): [T, Dispatch<SetStateAction<T>>] => {
  const state = useRef<T | undefined>(undefined);
  if (state.current === undefined) state.current = updateFn();
  const prevDeps = useRef<DependencyList | undefined>(undefined);

  // Since we store the state in a ref, we use this counter to force an update
  // when someone calls setState
  const [, setNumUpdates] = useState(0);

  // If this is the first render or the deps have changed, recalculate the state
  if (
    prevDeps.current === undefined ||
    deps.length !== prevDeps.current.length ||
    // Deps might be NaN, so we compare with Object.is rather than ===
    deps.some((d, i) => !Object.is(d, prevDeps.current![i]))
  ) {
    state.current = updateFn(state.current);
  }
  prevDeps.current = deps;

  return [
    state.current,
    useCallback(
      (action) => {
        if (typeof action === "function") {
          state.current = (action as (prevValue: T) => T)(state.current!);
        } else {
          state.current = action;
        }
        setNumUpdates((n) => n + 1); // Force an update
      },
      [setNumUpdates],
    ),
  ];
};

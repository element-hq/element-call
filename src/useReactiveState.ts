/*
Copyright 2023-2024 New Vector Ltd

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

import {
  DependencyList,
  Dispatch,
  SetStateAction,
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
  const state = useRef<T>();
  if (state.current === undefined) state.current = updateFn();
  const prevDeps = useRef<DependencyList>();

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

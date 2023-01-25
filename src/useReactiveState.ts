import {
  DependencyList,
  Dispatch,
  SetStateAction,
  useCallback,
  useRef,
  useState,
} from "react";

export const useReactiveState = <T>(
  updateFn: (prevState?: T) => T,
  deps: DependencyList
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
    deps.some((d, i) => d !== prevDeps.current![i])
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
      [setNumUpdates]
    ),
  ];
};

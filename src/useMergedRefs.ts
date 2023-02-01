import { MutableRefObject, RefCallback, useCallback } from "react";

export const useMergedRefs = <T>(
  ...refs: (MutableRefObject<T | null> | RefCallback<T | null>)[]
): RefCallback<T | null> =>
  useCallback(
    (value) =>
      refs.forEach((ref) => {
        if (typeof ref === "function") {
          ref(value);
        } else {
          ref.current = value;
        }
      }),
    refs
  );

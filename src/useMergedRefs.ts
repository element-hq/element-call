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
    // Since this isn't an array literal, we can't use the static dependency
    // checker, but that's okay
    // eslint-disable-next-line react-hooks/exhaustive-deps
    refs
  );

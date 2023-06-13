/*
Copyright 2023 New Vector Ltd

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

import { MutableRefObject, RefCallback, useCallback } from "react";

/**
 * Combines multiple refs into one, useful for attaching multiple refs to the
 * same DOM node.
 */
export const useMergedRefs = <T>(
  ...refs: (MutableRefObject<T | null> | RefCallback<T | null> | null)[]
): RefCallback<T | null> =>
  useCallback(
    (value) =>
      refs.forEach((ref) => {
        if (typeof ref === "function") {
          ref(value);
        } else if (ref !== null) {
          ref.current = value;
        }
      }),
    // Since this isn't an array literal, we can't use the static dependency
    // checker, but that's okay
    // eslint-disable-next-line react-hooks/exhaustive-deps
    refs
  );

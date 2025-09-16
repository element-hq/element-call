/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type RefCallback, type RefObject, useCallback } from "react";

/**
 * Combines multiple refs into one, useful for attaching multiple refs to the
 * same DOM node.
 */
export const useMergedRefs = <T>(
  ...refs: (RefObject<T | null> | RefCallback<T | null> | null | undefined)[]
): RefCallback<T | null> =>
  useCallback(
    (value) =>
      refs.forEach((ref) => {
        if (typeof ref === "function") {
          ref(value);
        } else if (ref) {
          ref.current = value;
        }
      }),
    // Since this isn't an array literal, we can't use the static dependency
    // checker, but that's okay
    // eslint-disable-next-line react-hooks/exhaustive-deps
    refs,
  );

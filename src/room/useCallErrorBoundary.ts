/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { ElementCallError } from "../utils/errors.ts";
import { GroupCallErrorBoundaryContext } from "./GroupCallErrorBoundaryContext.tsx";

export type UseErrorBoundaryApi = {
  showGroupCallErrorBoundary: (error: ElementCallError) => void;
};

export function useGroupCallErrorBoundary(): UseErrorBoundaryApi {
  const context = useContext(GroupCallErrorBoundaryContext);

  if (!context)
    throw new Error(
      "useGroupCallErrorBoundary must be used within an GoupCallErrorBoundary",
    );

  const [error, setError] = useState<ElementCallError | null>(null);

  const resetErrorIfNeeded = useCallback(
    (handled: ElementCallError): void => {
      // There might be several useGroupCallErrorBoundary in the tree,
      // so only clear our state if it's the one we're handling?
      if (error && handled === error) {
        // reset current state
        setError(null);
      }
    },
    [error],
  );

  useEffect(() => {
    // return a function to unsubscribe
    return context.subscribe((error: ElementCallError): void => {
      resetErrorIfNeeded(error);
    });
  }, [resetErrorIfNeeded, context]);

  const memoized: UseErrorBoundaryApi = useMemo(
    () => ({
      showGroupCallErrorBoundary: (error: ElementCallError) => setError(error),
    }),
    [],
  );

  if (error) {
    throw error;
  }

  return memoized;
}

/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useMemo, useState } from "react";

import type { ElementCallError } from "../utils/errors.ts";

export type UseErrorBoundaryApi = {
  showGroupCallErrorBoundary: (error: ElementCallError) => void;
};

export function useGroupCallErrorBoundary(): UseErrorBoundaryApi {
  const [error, setError] = useState<ElementCallError | null>(null);

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

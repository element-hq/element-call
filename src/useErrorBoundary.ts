/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useMemo, useState } from "react";

export type UseErrorBoundaryApi = {
  showErrorBoundary: (error: Error) => void;
};

export function useErrorBoundary(): UseErrorBoundaryApi {
  const [error, setError] = useState<Error | null>(null);

  const memoized: UseErrorBoundaryApi = useMemo(
    () => ({
      showErrorBoundary: (error: Error) => setError(error),
    }),
    [],
  );

  if (error) {
    throw error;
  }

  return memoized;
}

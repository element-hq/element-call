/*
Copyright 2023-2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * React hook that tracks whether the given media query matches.
 */
export function useMediaQuery(query: string): boolean {
  const mediaQuery = useMemo(() => window.matchMedia(query), [query]);

  const subscribe = useCallback(
    (onChange: () => void) => {
      mediaQuery.addEventListener("change", onChange);
      return (): void => mediaQuery.removeEventListener("change", onChange);
    },
    [mediaQuery],
  );
  const getState = useCallback(() => mediaQuery.matches, [mediaQuery]);
  return useSyncExternalStore(subscribe, getState);
}

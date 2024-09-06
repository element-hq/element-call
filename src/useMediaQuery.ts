/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { useCallback, useMemo, useState } from "react";

import { useEventTarget } from "./useEvents";

/**
 * React hook that tracks whether the given media query matches.
 */
export function useMediaQuery(query: string): boolean {
  const mediaQuery = useMemo(() => matchMedia(query), [query]);

  const [numChanges, setNumChanges] = useState(0);
  useEventTarget(
    mediaQuery,
    "change",
    useCallback(() => setNumChanges((n) => n + 1), [setNumChanges]),
  );

  // We want any change to the update counter to trigger an update here
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => mediaQuery.matches, [mediaQuery, numChanges]);
}

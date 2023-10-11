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

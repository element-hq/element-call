/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect, useState } from "react";
import { distinctUntilChanged, map } from "rxjs";

import { useRootElement } from "./RootElementContext";
import { useLatest } from "./useLatest";
import { type ElementSize, observeElementSize$ } from "./utils/elementSize";

/**
 * Whether the space Element Call is drawn in satisfies a condition on its
 * size: the counterpart of {@link useMediaQuery} for the container rather than
 * the viewport, and of the `@container element-call` queries in the
 * stylesheets. The two are the same thing standalone, where the root is the
 * page; for a component in a corner of a host's page they are not, and it is
 * the corner that matters.
 *
 * Re-renders only when the answer changes, not on every pixel of resize.
 */
export function useRootSizeMatches(
  matches: (size: ElementSize) => boolean,
): boolean {
  const rootElement = useRootElement();
  // The latest predicate, so that an inline arrow does not resubscribe on
  // every render
  const latestMatches = useLatest(matches);
  const [result, setResult] = useState(() =>
    matches({
      width: rootElement.clientWidth,
      height: rootElement.clientHeight,
    }),
  );

  useEffect(() => {
    const subscription = observeElementSize$(rootElement)
      .pipe(
        map((size) => latestMatches.current(size)),
        distinctUntilChanged(),
      )
      .subscribe(setResult);
    return (): void => subscription.unsubscribe();
  }, [rootElement, latestMatches]);

  return result;
}

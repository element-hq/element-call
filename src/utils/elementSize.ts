/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Observable, distinctUntilChanged } from "rxjs";

export interface ElementSize {
  width: number;
  height: number;
}

/**
 * Observes the size of an element, starting with the size it currently has and
 * following it through every change for as long as the subscription lasts.
 *
 * Measured with `clientWidth`/`clientHeight`, so borders, scrollbars and any
 * transforms a host might animate the element with are left out: this is the
 * space there is to draw in, not where the element happens to be painted.
 */
export function observeElementSize$(element: Element): Observable<ElementSize> {
  return new Observable<ElementSize>((subscriber) => {
    const measure = (): void =>
      subscriber.next({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    // Synchronously, so that a Behavior built on this has an initial value
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return (): void => observer.disconnect();
  }).pipe(
    // A ResizeObserver reports once on observe(), which repeats the first
    // measurement above, and again for changes to dimensions we do not read
    distinctUntilChanged(
      (a, b) => a.width === b.width && a.height === b.height,
    ),
  );
}

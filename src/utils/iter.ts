/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Fills in the 'undefined' gaps in a collection by drawing items from a second
 * collection, or simply filtering out the gap if no items are left. If filler
 * items remain at the end, they will be appended to the resulting collection.
 */
export function fillGaps<A>(
  gappy: Iterable<A | undefined>,
  filler: Iterable<A>,
): Iterable<A> {
  return {
    [Symbol.iterator](): Iterator<A> {
      const gappyIter = gappy[Symbol.iterator]();
      const fillerIter = filler[Symbol.iterator]();
      return {
        next(): IteratorResult<A> {
          let gappyItem: IteratorResult<A | undefined>;
          do {
            gappyItem = gappyIter.next();
            if (!gappyItem.done && gappyItem.value !== undefined)
              return gappyItem as IteratorYieldResult<A>;
            const fillerItem = fillerIter.next();
            if (!fillerItem.done) return fillerItem;
          } while (!gappyItem.done);
          return gappyItem;
        },
      };
    },
  };
}

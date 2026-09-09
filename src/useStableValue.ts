/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useState } from "react";
import { isEqual } from "lodash-es";

/**
 * Returns a value whose identity only changes when its contents do.
 *
 * For a prop that a caller is likely to write inline — an options object, say
 * — so that a fresh but equal object on every render does not restart whatever
 * depends on it. Deep equality by default.
 */
export function useStableValue<T>(
  value: T,
  equals: (a: T, b: T) => boolean = isEqual,
): T {
  const [stable, setStable] = useState(value);
  if (equals(stable, value)) return stable;
  // Setting state during render makes React re-run this render immediately
  // with the new state, at which point the two are identical and the stored
  // one is returned — so the identity handed out is consistent.
  setStable(value);
  return value;
}

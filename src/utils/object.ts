/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { shallowEquals as arrayShallowEquals } from "./array.ts";

/**
 * Determine whether two objects are equal by shallow comparison of their
 * top-level properties. Array-valued properties are themselves compared
 * shallowly, so two objects holding distinct arrays with the same elements are
 * considered equal.
 */
export function shallowEquals<T extends object>(
  a: Readonly<T>,
  b: Readonly<T>,
): boolean {
  // If a and b have the same number of keys and every key in a is also in b,
  // then they have the same keys.
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!(key in b)) return false;

    // Now check that they have the same values.
    const aValue = (a as any)[key];
    const bValue = (b as any)[key];
    if (Array.isArray(aValue) && Array.isArray(bValue)) {
      if (!arrayShallowEquals(aValue, bValue)) return false;
    } else if (aValue !== bValue) return false;
  }

  return true;
}

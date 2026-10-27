/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Determine whether two objects are equal by shallow comparison of their
 * top-level properties, using the given `comparator`.
 */
export function shallowEquals<T extends object>(
  a: Readonly<T>,
  b: Readonly<T>,
  comparator: (aValue: unknown, bValue: unknown) => boolean = (
    aValue,
    bValue,
  ) => aValue === bValue,
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
    if (!comparator(aValue, bValue)) return false;
  }

  return true;
}

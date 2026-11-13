/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Determine whether two arrays are equal by shallow comparison.
 */
export function shallowEquals<A>(first: A[], second: A[]): boolean {
  if (first.length !== second.length) return false;
  for (let i = 0; i < first.length; i++)
    if (first[i] !== second[i]) return false;
  return true;
}

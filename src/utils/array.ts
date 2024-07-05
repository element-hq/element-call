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

/**
 * Gets the index of the last element in the array to satsify the given
 * predicate.
 */
// TODO: remove this once TypeScript recognizes the existence of
// Array.prototype.findLastIndex
export function findLastIndex<T>(
  array: T[],
  predicate: (item: T, index: number) => boolean,
): number | null {
  for (let i = array.length - 1; i >= 0; i--) {
    if (predicate(array[i], i)) return i;
  }

  return null;
}

/**
 * Counts the number of elements in an array that satsify the given predicate.
 */
export const count = <T>(
  array: T[],
  predicate: (item: T, index: number) => boolean,
): number =>
  array.reduce(
    (acc, item, index) => (predicate(item, index) ? acc + 1 : acc),
    0,
  );

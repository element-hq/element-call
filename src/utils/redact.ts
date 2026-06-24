/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Redacts properties in the supplied object by replacing them with
 * a constant value.
 * @param obj Object in which to perform redaction
 * @param keys Keys to be redacted in the object
 * @returns A new object with the specified properties redacted
 */
export function redact<T extends object>(
  obj: T,
  ...keys: (keyof T)[]
): Record<keyof T, unknown> {
  const result: Record<keyof T, unknown> = { ...obj };
  for (const key of keys)
    if (key in result && result[key] != null) {
      result[key] = "<redacted>";
    }
  return result;
}

/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Check if a fetch response is a failure in a way that works with file:// URLs
 * @param response the response to check
 * @returns true if the response is a failure, false otherwise
 */
export function isFailure(response: Response): boolean {
  // if response says it's okay, then it's not a failure
  if (response.ok) {
    return false;
  }

  // fetch will return status === 0 for a success on a file:// URL, so we special case it
  if (response.url.startsWith("file:") && response.status === 0) {
    return false;
  }

  return true;
}

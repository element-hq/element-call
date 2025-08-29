/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The URL to return to after a successful OIDC authentication
 */
export function getOidcCallbackUrl(): URL {
  // TODO: save the path somewhere
  return new URL("after_login", window.location.origin);
}
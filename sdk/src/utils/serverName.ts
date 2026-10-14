/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/** The homeserver a Matrix user id belongs to: everything after the first colon. */
export function serverNameOf(userId: string): string {
  return userId.replace(/^.*?:/, "");
}

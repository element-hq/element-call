/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

export function createJTWToken(sub: string, room: string): string {
  return [
    {}, // header
    {
      // payload
      sub,
      video: {
        room,
      },
    },
    {}, // signature
  ]
    .map((d) => global.btoa(JSON.stringify(d)))
    .join(".");
}

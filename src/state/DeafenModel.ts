/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BehaviorSubject } from "rxjs";

/**
 * Whether the local user is currently deafened (all incoming audio muted).
 */
export const deafened$ = new BehaviorSubject(false);

/**
 * Toggle the local deafen state.
 */
export function toggleDeafen(): void {
  deafened$.next(!deafened$.value);
}

/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { platform } from "../Platform";

/** Whether Compound opens a menu as a drawer, as it does on a phone. */
export function menuIsDrawer(): boolean {
  return platform === "android" || platform === "ios";
}

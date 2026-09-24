/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { supportsBackgroundProcessors as supportsBackgroundProcessorsLivekitSdk } from "@livekit/track-processors";

/**
 * Whether this browser can run background effects: the one answer for the
 * controls and the pipeline, so nothing is offered that the pipeline refuses.
 */
export function supportsBackgroundProcessors(): boolean {
  return supportsBackgroundProcessorsLivekitSdk();
}

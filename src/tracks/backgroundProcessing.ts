/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { supportsBackgroundProcessors as supportsBackgroundProcessorsLivekitSdk } from "@livekit/track-processors";

import { platform } from "../Platform";

/** One answer for the controls and the pipeline, so neither offers what the other refuses. */
export function supportsBackgroundProcessors(): boolean {
  return supportsBackgroundProcessorsLivekitSdk() && platform === "desktop";
}

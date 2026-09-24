/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  supportsBackgroundProcessors as supportsBackgroundProcessorsLivekitSdk,
  supportsModernBackgroundProcessors,
} from "@livekit/track-processors";

import { platform } from "../Platform";

/** One answer for the controls and the pipeline, so neither offers what the other refuses. */
export function supportsBackgroundProcessors(): boolean {
  return supportsBackgroundProcessorsLivekitSdk() && platform === "desktop";
}

/**
 * Whether effects, where they run at all, draw every frame through a canvas:
 * the slower route, which costs frame rate and stalls the page while the
 * first one is built.
 */
export function usesFallbackProcessing(): boolean {
  return !supportsModernBackgroundProcessors();
}

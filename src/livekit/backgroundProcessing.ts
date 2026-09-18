/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { supportsBackgroundProcessors as supportsBackgroundProcessorsLivekitSdk } from "@livekit/track-processors";

import { platform } from "../Platform";

/**
 * Whether this device can run background effects at all.
 *
 * The one answer, for everything that asks. The controls and the pipeline used
 * to work it out separately, and differently: the pipeline required a desktop
 * while the controls asked only whether the browser had the APIs. A phone
 * browser has them, so it was offered a choice the pipeline then refused to
 * honour, and the video simply never changed — the worst of both, since it
 * neither worked nor said why.
 *
 * Anything that offers a background effect must ask this, so that what is
 * offered and what can be delivered cannot drift apart again.
 */
export function supportsBackgroundProcessors(): boolean {
  return supportsBackgroundProcessorsLivekitSdk() && platform === "desktop";
}

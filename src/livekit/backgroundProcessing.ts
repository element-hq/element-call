/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  supportsBackgroundProcessors as supportsBackgroundProcessorsLivekitSdk,
  supportsModernBackgroundProcessors,
} from "@livekit/track-processors";

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
 *
 * It no longer asks for a desktop. Measured, that test sorted devices by the
 * wrong thing: a phone on the fast path held 99% of its frame rate and was
 * refused, while a desktop on the slow one held 73% and was allowed. What the
 * cost tracks is the path, which {@link usesFallbackProcessing} names — and a
 * cost is something to tell someone about, not to decide for them, because the
 * user is the only one who knows whether they would rather show the room.
 */
export function supportsBackgroundProcessors(): boolean {
  return supportsBackgroundProcessorsLivekitSdk();
}

/**
 * Whether effects here run the slow way.
 *
 * Browsers without `MediaStreamTrackProcessor` — Safari and Firefox, on every
 * platform — fall back to drawing each frame through a canvas. Measured across
 * four of them, that costs between a sixth and a quarter of the frame rate,
 * phone or desktop, and on Safari it also blocks the page for twelve to
 * fifteen seconds the first time the segmenter is built.
 *
 * Not a reason to withhold the feature: that cost ships today wherever the
 * fallback runs, and it is a cost in smoothness while the feature is about
 * privacy. It is a reason to say so.
 */
export function usesFallbackProcessing(): boolean {
  return (
    supportsBackgroundProcessors() && !supportsModernBackgroundProcessors()
  );
}

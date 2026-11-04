/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Track, type TrackProcessor } from "livekit-client";

import { type VideoProcessor } from "../../media-api";
import { inTurn } from "../../utils/processorTurns";

export interface LivekitProcessor extends TrackProcessor<Track.Kind.Video> {
  /** The processor this adapts, so that setting the same one again is a no-op. */
  source: VideoProcessor;
}

/**
 * A `VideoProcessor` as livekit-client wants it. LiveKit reads the processed
 * track off the processor after `init` and `restart` rather than taking it as
 * their result, so the adapter keeps it there. A processor a lobby already
 * runs on the track is adopted with its output, `running`, so that the join
 * does not initialise it again. Every step takes its turn on the processor,
 * which a stopped track tears down without waiting for the next one's init.
 */
export function convertToLivekitProcessor(
  processor: VideoProcessor,
  running?: MediaStreamTrack,
): LivekitProcessor {
  const adapter: LivekitProcessor = {
    name: processor.name,
    source: processor,
    init: async (opts) =>
      inTurn(processor, async () => {
        adapter.processedTrack =
          running ?? (await processor.init(opts.track, opts.element));
        running = undefined;
      }),
    restart: async (opts) =>
      inTurn(processor, async () => {
        adapter.processedTrack = await processor.restart(
          opts.track,
          opts.element,
        );
      }),
    destroy: async () => inTurn(processor, async () => processor.destroy()),
  };
  return adapter;
}

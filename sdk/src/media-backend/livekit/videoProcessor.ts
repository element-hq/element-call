/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Track, type TrackProcessor } from "livekit-client";

import { type VideoProcessor } from "../../media-api";

const adapters = new WeakMap<
  VideoProcessor,
  TrackProcessor<Track.Kind.Video>
>();

/**
 * A `VideoProcessor` as livekit-client wants it. LiveKit reads the processed
 * track off the processor after `init` and `restart` rather than taking it as
 * their result, so the adapter keeps it there.
 *
 * One adapter per processor, so a track can tell that it already runs one: a
 * processor set again would otherwise be torn down and built anew.
 */
export function convertToLivekitProcessor(
  processor: VideoProcessor,
): TrackProcessor<Track.Kind.Video> {
  const existing = adapters.get(processor);
  if (existing) return existing;
  const adapter: TrackProcessor<Track.Kind.Video> = {
    name: processor.name,
    init: async (opts) => {
      adapter.processedTrack = await processor.init(opts.track, opts.element);
    },
    restart: async (opts) => {
      adapter.processedTrack = await processor.restart(
        opts.track,
        opts.element,
      );
    },
    destroy: async () => processor.destroy(),
  };
  adapters.set(processor, adapter);
  return adapter;
}

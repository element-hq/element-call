/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/lib/logger";

import { isFailure } from "./utils/fetch";

type SoundDefinition = { mp3?: string; ogg: string };

export type PrefetchedSounds<S extends string> = Promise<
  Record<S, ArrayBuffer>
>;

/**
 * Determine the best format we can use to play our sounds
 * through. We prefer ogg support if possible, but will fall
 * back to MP3.
 * @returns "ogg" if the browser is likely to support it, or "mp3" otherwise.
 */
function getPreferredAudioFormat(): "ogg" | "mp3" {
  const a = document.createElement("audio");
  if (a.canPlayType("audio/ogg") === "maybe") {
    return "ogg";
  }
  // Otherwise just assume MP3, as that has a chance of being more widely supported.
  return "mp3";
}

const preferredFormat = getPreferredAudioFormat();

/**
 * Prefetch sounds to be used by the AudioContext. This can
 * be called outside the scope of a component to ensure the
 * sounds load ahead of time.
 * @param sounds A set of sound files that may be played.
 * @returns A map of sound files to buffers.
 */
export async function prefetchSounds<S extends string>(
  sounds: Record<S, SoundDefinition>,
): PrefetchedSounds<S> {
  const buffers: Record<string, ArrayBuffer> = {};
  await Promise.all(
    Object.entries(sounds).map(async ([name, file]) => {
      const { mp3, ogg } = file as SoundDefinition;
      // Use preferred format, fallback to ogg if no mp3 is provided.
      // Load an audio file
      const response = await fetch(
        preferredFormat === "ogg" ? ogg : (mp3 ?? ogg),
      );
      if (isFailure(response)) {
        // If the sound doesn't load, it's not the end of the world. We won't play
        // the sound when requested, but it's better than failing the whole application.
        logger.warn(`Could not load sound ${name}, response was not okay`);
        return;
      }
      // Decode it
      buffers[name] = await response.arrayBuffer();
    }),
  );
  return buffers as Record<S, ArrayBuffer>;
}

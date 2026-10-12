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
 * Decode a `data:` URL into the bytes it carries.
 *
 * The component build inlines the sound files as `data:` URLs. Those could be
 * `fetch`ed like any other URL, but that fetch is subject to the host page's
 * Content Security Policy, and `connect-src` lists rarely allow `data:` (a `*`
 * source does not cover it). Reading the bytes out of the URL directly needs no
 * network access, so no policy can stop it.
 * @param url The `data:` URL to decode.
 * @returns The decoded bytes.
 */
function decodeDataUrl(url: string): ArrayBuffer {
  const separator = url.indexOf(",");
  if (!url.startsWith("data:") || separator === -1)
    throw new Error("Not a valid data: URL");
  const header = url.slice("data:".length, separator);
  // Vite only percent-encodes SVGs; every other inlined asset is base64.
  if (!header.split(";").includes("base64"))
    throw new Error("Only base64 data: URLs are supported");
  // `decoded` is a binary string: one char per byte
  const decoded = atob(url.slice(separator + 1));
  const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
  return bytes.buffer;
}

/**
 * Load the bytes of a single sound file.
 * @param url Where the sound is: an ordinary URL to fetch, or a `data:` URL.
 * @returns The bytes, or null if the sound could not be loaded.
 */
async function loadSound(url: string): Promise<ArrayBuffer | null> {
  if (url.startsWith("data:")) return decodeDataUrl(url);
  const response = await fetch(url);
  if (isFailure(response)) return null;
  return await response.arrayBuffer();
}

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
      const url = preferredFormat === "ogg" ? ogg : (mp3 ?? ogg);
      let buffer: ArrayBuffer | null = null;
      try {
        buffer = await loadSound(url);
      } catch (e) {
        logger.warn(`Could not load sound ${name}`, e);
      }
      if (buffer === null) {
        // If the sound doesn't load, it's not the end of the world. We won't play
        // the sound when requested, but it's better than failing the whole application.
        logger.warn(`Could not load sound ${name}, response was not okay`);
        return;
      }
      buffers[name] = buffer;
    }),
  );
  return buffers as Record<S, ArrayBuffer>;
}

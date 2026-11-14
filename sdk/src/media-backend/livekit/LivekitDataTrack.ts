/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Logger } from "matrix-js-sdk/lib/logger";
import { type RemoteDataTrack, type Room as LivekitRoom } from "livekit-client";
import { filter, map, Observable, share } from "rxjs";

import { type DataTrack } from "../../media-api";
import { byteStreams$ } from "./ByteStreams";
import { fromLivekitDataTrackName } from "./dataTrackName";

/**
 * A remote member's data track. Decryption is LiveKit's: its E2EE manager
 * reads the key index and IV off each frame or stream and decrypts with the
 * sender's key, so nothing here sees a key. A frame of an encrypted track that
 * does not decrypt is dropped by LiveKit. A stream is not checked: LiveKit
 * 2.23 sends an encrypted packet without its encryption type, so a received
 * stream reads as unencrypted either way, and a cleartext one would pass.
 */
export function createLivekitDataTrack(
  room: LivekitRoom,
  track: RemoteDataTrack,
  logger: Logger,
): DataTrack {
  const { name, reliable } = fromLivekitDataTrackName(track.info.name);
  const encrypted = track.info.usesE2ee;
  const data$ = reliable
    ? byteStreams$(room, track.info.name).pipe(
        filter(({ identity }) => identity === track.publisherIdentity),
        map(({ payload }) => payload),
      )
    : framesOf(track, logger);
  return {
    source: "data",
    kind: "data",
    id: track.info.sid,
    name,
    reliable,
    encrypted,
    data$,
  };
}

/** The track's frames, subscribed at the SFU while observed. */
function framesOf(
  track: RemoteDataTrack,
  logger: Logger,
): Observable<Uint8Array> {
  return new Observable<Uint8Array>((subscriber) => {
    const reader = track.subscribe().getReader();
    let cancelled = false;
    void (async (): Promise<void> => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          subscriber.next(value.payload);
        }
      } catch (e) {
        // A failed subscription ends the stream; a host's pipeline survives it
        if (!cancelled) logger.warn(`Data track ${track.info.name} ended`, e);
      }
      subscriber.complete();
    })();
    return (): void => {
      cancelled = true;
      reader.cancel().catch(() => {});
    };
  }).pipe(share());
}

/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger as rootLogger } from "matrix-js-sdk/lib/logger";
import {
  type ByteStreamReader,
  type Room as LivekitRoom,
} from "livekit-client";
import { catchError, concatMap, EMPTY, from, Observable, share } from "rxjs";

/** One byte stream, read to its end. */
export interface ReceivedBytes {
  /** The participant identity of the sender. */
  identity: string;
  payload: Uint8Array;
}

const byTopicByRoom = new WeakMap<
  LivekitRoom,
  Map<string, Observable<ReceivedBytes>>
>();

/**
 * The byte streams a room receives on a topic, in the order they started. A
 * room takes one handler per topic, so every observer of a topic shares it:
 * it is registered with the first subscription and released with the last.
 */
export function byteStreams$(
  room: LivekitRoom,
  topic: string,
): Observable<ReceivedBytes> {
  let byTopic = byTopicByRoom.get(room);
  if (byTopic === undefined) {
    byTopic = new Map();
    byTopicByRoom.set(room, byTopic);
  }
  let streams$ = byTopic.get(topic);
  if (streams$ === undefined) {
    streams$ = new Observable<{ reader: ByteStreamReader; identity: string }>(
      (subscriber) => {
        room.registerByteStreamHandler(topic, (reader, { identity }) =>
          subscriber.next({ reader, identity }),
        );
        return (): void => room.unregisterByteStreamHandler(topic);
      },
    ).pipe(
      concatMap(({ reader, identity }) =>
        from(readStream(reader, identity)).pipe(
          catchError((e: unknown) => {
            rootLogger
              .getChild("[ByteStreams]")
              .warn(`Dropping a stream on ${topic} from ${identity}`, e);
            return EMPTY;
          }),
        ),
      ),
      share(),
    );
    byTopic.set(topic, streams$);
  }
  return streams$;
}

async function readStream(
  reader: ByteStreamReader,
  identity: string,
): Promise<ReceivedBytes> {
  const chunks = await reader.readAll();
  const payload = new Uint8Array(
    chunks.reduce((length, chunk) => length + chunk.length, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    payload.set(chunk, offset);
    offset += chunk.length;
  }
  return { identity, payload };
}

/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/lib/logger";
import {
  type ByteStreamHandler,
  type ByteStreamReader,
  type DataTrackFrame,
  type RemoteDataTrack,
  type Room as LivekitRoom,
} from "livekit-client";
import { describe, expect, it, vi } from "vitest";

import { createLivekitDataTrack } from "./LivekitDataTrack";
import { flushPromises } from "../../utils/test";

function remoteTrack(
  name: string,
  usesE2ee = true,
): {
  track: RemoteDataTrack;
  frames: ReadableStreamDefaultController<DataTrackFrame>[];
  cancel: ReturnType<typeof vi.fn>;
} {
  const frames: ReadableStreamDefaultController<DataTrackFrame>[] = [];
  const cancel = vi.fn();
  const track = {
    info: { sid: "DT_1", name, usesE2ee },
    publisherIdentity: "alice",
    subscribe: vi.fn(
      () =>
        new ReadableStream<DataTrackFrame>({
          start: (controller): void => {
            frames.push(controller);
          },
          cancel,
        }),
    ),
  } as unknown as RemoteDataTrack;
  return { track, frames, cancel };
}

function roomWithStreams(): {
  room: LivekitRoom;
  send: (identity: string, bytes: number[]) => void;
} {
  const handlers = new Map<string, ByteStreamHandler>();
  return {
    room: {
      registerByteStreamHandler: (topic: string, h: ByteStreamHandler) =>
        handlers.set(topic, h),
      unregisterByteStreamHandler: (topic: string) => handlers.delete(topic),
    } as unknown as LivekitRoom,
    send: (identity, bytes): void =>
      handlers.get("reliable:chat")!(
        {
          readAll: async () => Promise.resolve([new Uint8Array(bytes)]),
        } as unknown as ByteStreamReader,
        { identity },
      ),
  };
}

describe("a remote data track", () => {
  it("names itself without the LiveKit prefix", () => {
    const { track } = remoteTrack("reliable:chat", false);
    expect(
      createLivekitDataTrack(roomWithStreams().room, track, logger),
    ).toMatchObject({
      source: "data",
      kind: "data",
      id: "DT_1",
      name: "chat",
      reliable: true,
      encrypted: false,
    });
  });

  it("subscribes a lossy track while observed, once for all observers", async () => {
    const { track, frames, cancel } = remoteTrack("lossy:cursors");
    const dataTrack = createLivekitDataTrack(
      roomWithStreams().room,
      track,
      logger,
    );
    expect(track.subscribe).not.toHaveBeenCalled();

    const received: Uint8Array[] = [];
    const first = dataTrack.data$.subscribe((p) => received.push(p));
    const second = dataTrack.data$.subscribe();
    expect(track.subscribe).toHaveBeenCalledTimes(1);
    frames[0].enqueue({ payload: new Uint8Array([7]) });
    await flushPromises();
    expect(received).toEqual([new Uint8Array([7])]);

    first.unsubscribe();
    expect(cancel).not.toHaveBeenCalled();
    second.unsubscribe();
    expect(cancel).toHaveBeenCalled();
  });

  it("takes a reliable track's streams from its publisher only", async () => {
    const { room, send } = roomWithStreams();
    const dataTrack = createLivekitDataTrack(
      room,
      remoteTrack("reliable:chat").track,
      logger,
    );
    const received: Uint8Array[] = [];
    const subscription = dataTrack.data$.subscribe((p) => received.push(p));

    send("bob", [1]);
    send("alice", [2]);
    await flushPromises();

    // Bob's is not this track's
    expect(received).toEqual([new Uint8Array([2])]);
    subscription.unsubscribe();
  });
});

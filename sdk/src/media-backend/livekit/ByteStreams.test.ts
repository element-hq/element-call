/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type ByteStreamHandler,
  type ByteStreamReader,
  type Room as LivekitRoom,
} from "livekit-client";
import { describe, expect, it, vi } from "vitest";

import { byteStreams$, type ReceivedBytes } from "./ByteStreams";
import { flushPromises } from "../../utils/test";

function fakeRoom(): {
  room: LivekitRoom;
  handlers: Map<string, ByteStreamHandler>;
} {
  const handlers = new Map<string, ByteStreamHandler>();
  const room = {
    registerByteStreamHandler: vi.fn(
      (topic: string, handler: ByteStreamHandler) => {
        if (handlers.has(topic)) throw new Error("already registered");
        handlers.set(topic, handler);
      },
    ),
    unregisterByteStreamHandler: vi.fn((topic: string) =>
      handlers.delete(topic),
    ),
  } as unknown as LivekitRoom;
  return { room, handlers };
}

function reader(chunks: number[][]): {
  reader: ByteStreamReader;
  finish: () => void;
} {
  const done = Promise.withResolvers<Uint8Array[]>();
  return {
    reader: {
      readAll: async () => done.promise,
    } as unknown as ByteStreamReader,
    finish: (): void => done.resolve(chunks.map((c) => new Uint8Array(c))),
  };
}

describe("byteStreams$", () => {
  it("shares one handler per topic, released with the last observer", () => {
    const { room, handlers } = fakeRoom();
    const first = byteStreams$(room, "reliable:chat").subscribe();
    const second = byteStreams$(room, "reliable:chat").subscribe();
    expect(room.registerByteStreamHandler).toHaveBeenCalledTimes(1);
    first.unsubscribe();
    expect(handlers.has("reliable:chat")).toBe(true);
    second.unsubscribe();
    expect(handlers.has("reliable:chat")).toBe(false);
  });

  it("joins the chunks and keeps the order the streams started in", async () => {
    const { room, handlers } = fakeRoom();
    const received: ReceivedBytes[] = [];
    const subscription = byteStreams$(room, "reliable:chat").subscribe((r) =>
      received.push(r),
    );
    const handler = handlers.get("reliable:chat")!;
    const one = reader([[1, 2], [3]]);
    const two = reader([[4]]);
    handler(one.reader, { identity: "alice" });
    handler(two.reader, { identity: "bob" });
    two.finish();
    await flushPromises();
    expect(received).toEqual([]);
    one.finish();
    await flushPromises();

    expect(received).toEqual([
      { identity: "alice", payload: new Uint8Array([1, 2, 3]) },
      { identity: "bob", payload: new Uint8Array([4]) },
    ]);
    subscription.unsubscribe();
  });
});

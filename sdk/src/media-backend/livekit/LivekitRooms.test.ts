/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/lib/logger";
import { describe, expect, it, vi } from "vitest";

import { type ConnectionRole } from "./auth";
import { type Connection } from "./Connection";
import { LivekitRooms, livekitRoomKey } from "./LivekitRooms";

const room = livekitRoomKey("wss://sfu.example.org", "alias");
const otherRoom = livekitRoomKey("wss://sfu.example.org", "other");

describe("LivekitRooms", () => {
  it("hands a free room to its first claimant at once", async () => {
    const rooms = new LivekitRooms(logger);
    const a = connection();
    await expect(rooms.claim(a, room)).resolves.toBe(false);
    expect(rooms.holders$.value).toEqual(new Map([[a, a]]));
  });

  it("makes a subscriber wait for a held room, reading it through the holder meanwhile", async () => {
    const rooms = new LivekitRooms(logger);
    const a = connection();
    const b = connection();
    await rooms.claim(a, room);
    const held = settled(rooms.claim(b, room));
    expect(rooms.holders$.value).toEqual(
      new Map([
        [a, a],
        [b, a],
      ]),
    );
    expect(await held()).toBe(false);

    rooms.release(a);
    expect(await held()).toBe(true);
    // A released connection still reads the room through whoever holds it
    expect(rooms.holders$.value).toEqual(
      new Map([
        [a, b],
        [b, b],
      ]),
    );
  });

  it("lets a publisher take a room over and stops the subscriber holding it", async () => {
    const rooms = new LivekitRooms(logger);
    const subscriber = connection();
    const publisher = connection("publisher");
    await rooms.claim(subscriber, room);

    await expect(rooms.claim(publisher, room)).resolves.toBe(false);
    expect(subscriber.stop).toHaveBeenCalled();
    // The stopped subscriber still reads the room, now through the publisher
    rooms.release(subscriber);
    expect(rooms.holders$.value).toEqual(
      new Map([
        [subscriber, publisher],
        [publisher, publisher],
      ]),
    );
  });

  it("settles a waiter's claim when it is released without the room", async () => {
    const rooms = new LivekitRooms(logger);
    const a = connection();
    const b = connection();
    await rooms.claim(a, room);
    const held = settled(rooms.claim(b, room));

    rooms.release(b);
    expect(await held()).toBe(true);
    expect(rooms.holders$.value).toEqual(
      new Map([
        [a, a],
        [b, a],
      ]),
    );
  });

  it("keeps rooms apart", async () => {
    const rooms = new LivekitRooms(logger);
    const a = connection();
    const b = connection();
    await rooms.claim(a, room);
    await expect(rooms.claim(b, otherRoom)).resolves.toBe(false);
    expect(rooms.holders$.value).toEqual(
      new Map([
        [a, a],
        [b, b],
      ]),
    );
  });

  it("forgets a connection for good", async () => {
    const rooms = new LivekitRooms(logger);
    const a = connection();
    const b = connection();
    await rooms.claim(a, room);
    void rooms.claim(b, room);

    rooms.forget(a);
    expect(rooms.holders$.value).toEqual(new Map([[b, b]]));
    rooms.forget(b);
    expect(rooms.holders$.value).toEqual(new Map());
  });

  it("ignores a release from a connection that never claimed", () => {
    const rooms = new LivekitRooms(logger);
    expect(() => rooms.release(connection())).not.toThrow();
  });

  it("reports whether a claimant had to wait", async () => {
    const rooms = new LivekitRooms(logger);
    const a = connection();
    const b = connection();
    await rooms.claim(a, room);
    const claim = rooms.claim(b, room);
    rooms.release(a);
    await expect(claim).resolves.toBe(true);
  });

  it("names the holder of a room", async () => {
    const rooms = new LivekitRooms(logger);
    const a = connection();
    expect(rooms.holderOf(room)).toBeUndefined();
    await rooms.claim(a, room);
    expect(rooms.holderOf(room)).toBe(a);
  });
});

describe("livekitRoomKey", () => {
  it("spells the SFU url one way however the token did", () => {
    expect(livekitRoomKey("wss://sfu.example.org", "alias")).toBe(
      livekitRoomKey("wss://sfu.example.org/", "alias"),
    );
    expect(livekitRoomKey("wss://sfu.example.org/", "alias")).toBe(
      livekitRoomKey("WSS://SFU.EXAMPLE.ORG", "alias"),
    );
  });

  it("keeps SFUs and aliases apart", () => {
    const key = livekitRoomKey("wss://sfu.example.org", "alias");
    expect(livekitRoomKey("wss://sfu.example.org/sfu", "alias")).not.toBe(key);
    expect(livekitRoomKey("wss://sfu.example.org", "other")).not.toBe(key);
  });

  it("falls back to the raw string for something that is not a url", () => {
    expect(livekitRoomKey("not a url", "alias")).toBe(
      JSON.stringify(["not a url", "alias"]),
    );
  });
});

function connection(role: ConnectionRole = "subscriber"): Connection {
  return { role, stop: vi.fn() } as unknown as Connection;
}

/** Whether a promise has settled by the time the microtasks have run. */
function settled(promise: Promise<unknown>): () => Promise<boolean> {
  let done = false;
  void promise.then(() => (done = true));
  return async () => {
    await Promise.resolve();
    await Promise.resolve();
    return done;
  };
}

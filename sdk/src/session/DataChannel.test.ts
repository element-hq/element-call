/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { EventEmitter } from "events";
import { type RemoteParticipant, RoomEvent } from "livekit-client";
import { logger } from "matrix-js-sdk/lib/logger";
import { BehaviorSubject } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import { type DataMessage, type RemoteRTCMember } from "../api";
import { Epoch } from "../reactive/ObservableScope";
import { constant } from "../reactive/Behavior";
import { type Connection, ConnectionState } from "./Connection";
import { ConnectionManagerData } from "./ConnectionManager";
import { createDataChannel$ } from "./DataChannel";
import { exampleTransport, testScope } from "../utils/test";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

function fakeConnection(
  url: string,
  state = ConnectionState.LivekitConnected,
): {
  connection: Connection;
  room: EventEmitter;
  publishData: ReturnType<typeof vi.fn>;
} {
  const room = new EventEmitter();
  const publishData = vi.fn(async () => Promise.resolve());
  const connection = {
    transport: { ...exampleTransport, livekit_service_url: url },
    state$: constant(state),
    livekitRoom: Object.assign(room, { localParticipant: { publishData } }),
  } as unknown as Connection;
  return { connection, room, publishData };
}

function member(id: string): RemoteRTCMember {
  return { id, userId: `@${id}:example.org` } as RemoteRTCMember;
}

function setup(
  connections: Connection[],
  members: RemoteRTCMember[] = [member("alice")],
): {
  received: DataMessage[];
  connections$: BehaviorSubject<Epoch<ConnectionManagerData>>;
  sendData: (topic: string, text: string) => Promise<void>;
} {
  const data = new ConnectionManagerData();
  for (const connection of connections) data.add(connection, []);
  const connections$ = new BehaviorSubject(new Epoch(data));
  const { data$, sendData } = createDataChannel$({
    scope: testScope(),
    connectionManager: { connectionManagerData$: connections$ },
    remoteMembers$: constant(members),
    connection$: constant(connections[0] ?? null),
    logger,
  });
  const received: DataMessage[] = [];
  data$.subscribe((message) => received.push(message));
  return { received, connections$, sendData };
}

describe("data$", () => {
  it("delivers a packet from a member with its topic and text", () => {
    const { connection, room } = fakeConnection("https://sfu");
    const { received } = setup([connection]);

    room.emit(
      RoomEvent.DataReceived,
      encode("hello"),
      { identity: "alice" } as RemoteParticipant,
      undefined,
      "chat",
    );

    expect(received).toEqual([
      { member: member("alice"), topic: "chat", text: "hello" },
    ]);
  });

  it("drops packets from the server and from identities that are not members", () => {
    const { connection, room } = fakeConnection("https://sfu");
    const { received } = setup([connection]);

    room.emit(RoomEvent.DataReceived, encode("server"), undefined);
    room.emit(RoomEvent.DataReceived, encode("stranger"), {
      identity: "mallory",
    } as RemoteParticipant);

    expect(received).toEqual([]);
  });

  it("listens on every connection, including ones added later", () => {
    const first = fakeConnection("https://sfu-1");
    const second = fakeConnection("https://sfu-2");
    const { received, connections$ } = setup(
      [first.connection],
      [member("alice"), member("bob")],
    );

    const data = new ConnectionManagerData();
    data.add(first.connection, []);
    data.add(second.connection, []);
    connections$.next(new Epoch(data, 1));

    first.room.emit(RoomEvent.DataReceived, encode("one"), {
      identity: "alice",
    } as RemoteParticipant);
    second.room.emit(RoomEvent.DataReceived, encode("two"), {
      identity: "bob",
    } as RemoteParticipant);

    expect(received.map((m) => [m.member.id, m.text])).toEqual([
      ["alice", "one"],
      ["bob", "two"],
    ]);
  });
});

describe("sendData", () => {
  it("publishes the text as a reliable packet on the local connection", async () => {
    const { connection, publishData } = fakeConnection("https://sfu");
    const { sendData } = setup([connection]);

    await sendData("chat", "hello");

    expect(publishData).toHaveBeenCalledWith(encode("hello"), {
      reliable: true,
      topic: "chat",
    });
  });

  it("rejects while the local transport is not connected", async () => {
    const { connection, publishData } = fakeConnection(
      "https://sfu",
      ConnectionState.Initialized,
    );
    const { sendData } = setup([connection]);

    await expect(sendData("chat", "hello")).rejects.toThrow("not connected");
    expect(publishData).not.toHaveBeenCalled();
  });
});

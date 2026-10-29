/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "events";
import { ClientEvent, EventType, MatrixEvent } from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/lib/logger";

import { ObservableScope } from "../../reactive/ObservableScope";
import {
  createSignalling,
  SEQ_GAP_TIMEOUT_MS,
  SeqOrderer,
  SignallingEventType,
  type SignallingClient,
  type SignallingMessage,
} from "./signalling";

describe("SeqOrderer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("delivers in seq order", () => {
    const delivered: string[] = [];
    const orderer = new SeqOrderer<string>((s) => delivered.push(s));
    orderer.push(1, "b");
    orderer.push(2, "c");
    expect(delivered).toEqual([]);
    orderer.push(0, "a");
    expect(delivered).toEqual(["a", "b", "c"]);
  });

  it("skips a gap that isn't filled in time, then drops the late message", () => {
    const delivered: string[] = [];
    const orderer = new SeqOrderer<string>((s) => delivered.push(s));
    orderer.push(0, "a");
    orderer.push(2, "c");
    vi.advanceTimersByTime(SEQ_GAP_TIMEOUT_MS);
    expect(delivered).toEqual(["a", "c"]);
    orderer.push(1, "b");
    expect(delivered).toEqual(["a", "c"]);
  });
});

describe("createSignalling", () => {
  const own = { userId: "@me:x", deviceId: "MINE", memberId: "me" };

  function setup(): {
    client: SignallingClient & EventEmitter;
    received: SignallingMessage[];
    scope: ObservableScope;
  } {
    const client = Object.assign(new EventEmitter(), {
      encryptAndSendToDevice: vi.fn(async () => Promise.resolve()),
    }) as unknown as SignallingClient & EventEmitter;
    const scope = new ObservableScope();
    const signalling = createSignalling({
      scope,
      client,
      roomId: "!room:x",
      slotId: "m.call#ROOM",
      own,
      logger,
    });
    const received: SignallingMessage[] = [];
    signalling.messages$.subscribe((m) => received.push(m));
    return { client, received, scope };
  }

  function toDevice(
    type: string,
    content: Record<string, unknown>,
    encrypted = true,
  ): MatrixEvent {
    const event = new MatrixEvent({ type, sender: "@peer:x", content });
    if (encrypted)
      vi.spyOn(event, "getWireType").mockReturnValue(
        EventType.RoomMessageEncrypted,
      );
    return event;
  }

  const common = {
    room_id: "!room:x",
    slot_id: "m.call#ROOM",
    member_id: "peer",
    target_member_id: "me",
    connection_id: "c1",
    device_id: "PEER",
  };

  it("passes valid messages on and drops cleartext or misaddressed ones", () => {
    const { client, received, scope } = setup();
    client.emit(
      ClientEvent.ToDeviceEvent,
      toDevice(SignallingEventType.subscribe, { ...common, seq: 0 }, false),
    );
    client.emit(
      ClientEvent.ToDeviceEvent,
      toDevice(SignallingEventType.subscribe, {
        ...common,
        target_member_id: "someone else",
        seq: 0,
      }),
    );
    expect(received).toEqual([]);
    client.emit(
      ClientEvent.ToDeviceEvent,
      toDevice(SignallingEventType.subscribe, { ...common, seq: 0 }),
    );
    expect(received).toEqual([
      {
        type: "subscribe",
        memberId: "peer",
        userId: "@peer:x",
        deviceId: "PEER",
        connectionId: "c1",
      },
    ]);
    scope.end();
  });

  it("orders by seq across connection ids", () => {
    const { client, received, scope } = setup();
    client.emit(
      ClientEvent.ToDeviceEvent,
      toDevice(SignallingEventType.subscribe, {
        ...common,
        connection_id: "c2",
        seq: 2,
      }),
    );
    client.emit(
      ClientEvent.ToDeviceEvent,
      toDevice(SignallingEventType.close, { ...common, seq: 1 }),
    );
    client.emit(
      ClientEvent.ToDeviceEvent,
      toDevice(SignallingEventType.subscribe, { ...common, seq: 0 }),
    );
    expect(received.map((m) => [m.type, m.connectionId])).toEqual([
      ["subscribe", "c1"],
      ["close", "c1"],
      ["subscribe", "c2"],
    ]);
    scope.end();
  });

  it("keeps the well-formed metadata of a description", () => {
    const { client, received, scope } = setup();
    client.emit(
      ClientEvent.ToDeviceEvent,
      toDevice(SignallingEventType.description, {
        ...common,
        seq: 0,
        description: { type: "answer", sdp: "answer" },
        consumption_metadata: {
          s: { in_use: false, max_width: 1e9, max_height: -1 },
          bad: "not an object",
        },
      }),
    );
    expect(received).toEqual([
      expect.objectContaining({
        type: "description",
        consumption_metadata: { s: { in_use: false, max_width: 16_384 } },
      }),
    ]);
    scope.end();
  });

  it("sends each payload as its event type", () => {
    const { client, scope } = setup();
    const signalling = createSignalling({
      scope,
      client,
      roomId: "!room:x",
      slotId: "m.call#ROOM",
      own,
      logger,
    });
    signalling.send(
      { userId: "@peer:x", deviceId: "PEER", memberId: "peer" },
      "c1",
      { type: "close", reason: "bye" },
    );
    expect(client.encryptAndSendToDevice).toHaveBeenCalledWith(
      SignallingEventType.close,
      [{ userId: "@peer:x", deviceId: "PEER" }],
      expect.objectContaining({ reason: "bye", connection_id: "c1", seq: 0 }),
    );
    scope.end();
  });
});

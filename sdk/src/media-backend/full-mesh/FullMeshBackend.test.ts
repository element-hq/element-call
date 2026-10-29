/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "events";
import {
  ClientEvent,
  EventType,
  type ITurnServer,
  MatrixEvent,
} from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/lib/logger";
import { type Transport } from "matrix-js-sdk/lib/matrixrtc";
import { BehaviorSubject, NEVER } from "rxjs";

import { type RTCMember, type TransportMetadata } from "../../api";
import { defaultSessionTimings } from "../../config";
import { E2eeType } from "../../encryption";
import { constant } from "../../reactive/Behavior";
import { ObservableScope } from "../../reactive/ObservableScope";
import {
  type DataPacket,
  type MediaBackend,
  MediaConnectionState,
} from "../api";
import {
  completeFullMeshTransport,
  createFullMeshBackend,
  type FullMeshBackendOptions,
} from "./FullMeshBackend";
import { DATA_PROTOCOL, DATA_PURPOSE, DATA_STREAM_ID } from "./metadata";
import { FULL_MESH_TRANSPORT_TYPE, SignallingEventType } from "./signalling";
import {
  FakePeerConnection,
  installWebRtcFakes,
  lastPeerConnection,
  peer,
  settle,
} from "./test";

const roomId = "!room:example.org";
const slotId = "m.call#ROOM";
const own = { userId: "@me:example.org", deviceId: "MYDEVICE", memberId: "me" };

const fullMesh = (deviceId: string): Transport => ({
  type: FULL_MESH_TRANSPORT_TYPE,
  device_id: deviceId,
});
const livekit: Transport = { type: "livekit", livekit_service_url: "x" };

function metadata(raw: Transport): TransportMetadata {
  return {
    type: raw.type,
    id: JSON.stringify(raw),
    raw,
    resolved$: constant(undefined),
  };
}

describe("createFullMeshBackend", () => {
  let scope: ObservableScope;
  let client: EventEmitter & FullMeshBackendOptions["client"];
  let send: ReturnType<typeof vi.fn>;
  let turnServers: ITurnServer[];
  let backend: MediaBackend;
  const seq = new Map<string, number>();

  /** A to-device message from `peer` (or another sender), as the sync would deliver it. */
  function deliver(
    type: string,
    connectionId: string,
    content: Record<string, unknown> = {},
    from = peer,
  ): void {
    const next = seq.get(from.memberId) ?? 0;
    seq.set(from.memberId, next + 1);
    const event = new MatrixEvent({
      type,
      sender: from.userId,
      content: {
        room_id: roomId,
        slot_id: slotId,
        member_id: from.memberId,
        target_member_id: own.memberId,
        device_id: from.deviceId,
        connection_id: connectionId,
        seq: next,
        ...content,
      },
    });
    vi.spyOn(event, "getWireType").mockReturnValue(
      EventType.RoomMessageEncrypted,
    );
    client.emit(ClientEvent.ToDeviceEvent, event);
  }

  /** What we sent, as [type, recipient device, content]. */
  function sent(type?: string): [string, string, Record<string, unknown>][] {
    return send.mock.calls
      .filter(([t]) => type === undefined || t === type)
      .map(([t, [target], content]) => [t, target.deviceId, content]);
  }

  /** A member of the slot, as the session hands it to the backend. */
  function addMember(
    transport: Transport,
    who = peer,
  ): { scope: ObservableScope; tracks: () => unknown } {
    const memberScope = new ObservableScope();
    const media = backend.mediaFor(memberScope, {
      ...who,
      rtcBackendIdentity: `${who.userId}:${who.deviceId}`,
      transport$: new BehaviorSubject(metadata(transport)),
    } as unknown as RTCMember);
    return { scope: memberScope, tracks: () => media.tracks$.value };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    installWebRtcFakes();
    seq.clear();
    scope = new ObservableScope();
    send = vi.fn(async () => Promise.resolve());
    turnServers = [];
    client = Object.assign(new EventEmitter(), {
      encryptAndSendToDevice: send,
      getTurnServers: (): ITurnServer[] => turnServers,
      checkTurnServers: vi.fn(async () => {
        turnServers = [{ urls: ["turn:x"], username: "u", credential: "p" }];
        return Promise.resolve(true);
      }),
    }) as unknown as EventEmitter & FullMeshBackendOptions["client"];
    backend = createFullMeshBackend(
      scope,
      {
        roomId,
        slotId,
        ownMembershipIdentity: own,
        publish: [],
        encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
        mediaKeys$: NEVER,
        timings: defaultSessionTimings,
        logger,
      },
      { client },
    );
  });
  afterEach(() => {
    scope.end();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("only prepares a full mesh transport", async () => {
    await expect(backend.prepareLocalTransport(livekit)).rejects.toThrow(
      "Not a full mesh transport: livekit",
    );
    await expect(
      backend.prepareLocalTransport(fullMesh(own.deviceId)),
    ).resolves.toEqual({ canDelegateDelayedLeave: false });
    expect(backend.local.connectionState$.value).toBe(
      MediaConnectionState.Connected,
    );
  });

  it("fetches TURN servers when the client has none yet", async () => {
    await backend.prepareLocalTransport(fullMesh(own.deviceId));
    expect(client.checkTurnServers).toHaveBeenCalledOnce();
    addMember(fullMesh(peer.deviceId));
    await settle();
    expect(lastPeerConnection().config.iceServers).toEqual([
      { urls: ["turn:x"], username: "u", credential: "p" },
    ]);
  });

  describe("as a publisher", () => {
    it("turns subscribers away while it doesn't publish", async () => {
      addMember(livekit);
      deliver(SignallingEventType.subscribe, "c1");
      await settle();
      expect(sent()).toEqual([
        [
          SignallingEventType.close,
          peer.deviceId,
          expect.objectContaining({
            reason: "not_publishing",
            connection_id: "c1",
          }),
        ],
      ]);
    });

    it("offers to a member on any transport", async () => {
      await backend.prepareLocalTransport(fullMesh(own.deviceId));
      addMember(livekit);
      deliver(SignallingEventType.subscribe, "c1");
      await settle();
      expect(sent(SignallingEventType.description)).toEqual([
        [
          SignallingEventType.description,
          peer.deviceId,
          expect.objectContaining({
            connection_id: "c1",
            target_member_id: peer.memberId,
            description: { type: "offer", sdp: "offer-1" },
          }),
        ],
      ]);
    });

    it("waits for the membership of a subscriber that is ahead of it", async () => {
      await backend.prepareLocalTransport(fullMesh(own.deviceId));
      deliver(SignallingEventType.subscribe, "c1");
      await vi.advanceTimersByTimeAsync(5_000);
      expect(sent()).toEqual([]);
      addMember(livekit);
      await settle();
      expect(sent(SignallingEventType.description)).toHaveLength(1);
    });

    it("rejects a subscriber that never becomes a member", async () => {
      await backend.prepareLocalTransport(fullMesh(own.deviceId));
      deliver(SignallingEventType.subscribe, "c1");
      await vi.advanceTimersByTimeAsync(10_000);
      expect(sent()).toEqual([
        [
          SignallingEventType.close,
          peer.deviceId,
          expect.objectContaining({ reason: "not_a_member" }),
        ],
      ]);
      expect(FakePeerConnection.instances).toEqual([]);
    });

    it("rejects a subscriber claiming another device of the member", async () => {
      await backend.prepareLocalTransport(fullMesh(own.deviceId));
      addMember(livekit);
      deliver(
        SignallingEventType.subscribe,
        "c1",
        {},
        {
          ...peer,
          deviceId: "OTHERDEVICE",
        },
      );
      await settle();
      expect(sent()).toEqual([
        [
          SignallingEventType.close,
          "OTHERDEVICE",
          expect.objectContaining({ reason: "not_a_member" }),
        ],
      ]);
    });

    it("only serves the newest of several waiting subscribe requests", async () => {
      await backend.prepareLocalTransport(fullMesh(own.deviceId));
      deliver(SignallingEventType.subscribe, "c1");
      deliver(SignallingEventType.subscribe, "c2");
      addMember(livekit);
      await settle();
      expect(
        sent(SignallingEventType.description).map(([, , c]) => c.connection_id),
      ).toEqual(["c2"]);
    });

    it("replaces the connection of a member that subscribes again", async () => {
      await backend.prepareLocalTransport(fullMesh(own.deviceId));
      addMember(livekit);
      deliver(SignallingEventType.subscribe, "c1");
      await settle();
      const first = lastPeerConnection();
      deliver(SignallingEventType.subscribe, "c2");
      await settle();
      expect(first.closed).toBe(true);
      expect(lastPeerConnection()).not.toBe(first);
    });

    it("hands the subscriber's messages to its connection", async () => {
      await backend.prepareLocalTransport(fullMesh(own.deviceId));
      addMember(livekit);
      deliver(SignallingEventType.subscribe, "c1");
      await settle();
      deliver(SignallingEventType.description, "c1", {
        description: { type: "answer", sdp: "answer" },
      });
      deliver(SignallingEventType.candidates, "c1", {
        candidates: [{ candidate: "x" }],
      });
      // A late message of an earlier connection goes nowhere
      deliver(SignallingEventType.candidates, "c0", {
        candidates: [{ candidate: "stale" }],
      });
      await settle();
      const pc = lastPeerConnection();
      expect(pc.remoteDescription).toEqual({ type: "answer", sdp: "answer" });
      expect(pc.addedCandidates).toEqual([{ candidate: "x" }]);
    });

    it("stops sending to a member that leaves", async () => {
      await backend.prepareLocalTransport(fullMesh(own.deviceId));
      const member = addMember(livekit);
      deliver(SignallingEventType.subscribe, "c1");
      await settle();
      member.scope.end();
      expect(lastPeerConnection().closed).toBe(true);
      expect(sent(SignallingEventType.close)).toEqual([
        [
          SignallingEventType.close,
          peer.deviceId,
          expect.objectContaining({ connection_id: "c1" }),
        ],
      ]);
    });

    it("lists its subscribers for the developer tools", async () => {
      expect(backend.connections$.value).toEqual([]);
      await backend.prepareLocalTransport(fullMesh(own.deviceId));
      expect(backend.connections$.value).toEqual([
        {
          transport: fullMesh(own.deviceId),
          state: MediaConnectionState.Connected,
          resolved: {
            type: FULL_MESH_TRANSPORT_TYPE,
            role: "publisher",
            peerConnections: [],
          },
        },
      ]);

      addMember(livekit);
      deliver(SignallingEventType.subscribe, "c1");
      await settle();
      expect(backend.connections$.value[0].resolved).toMatchObject({
        peerConnections: [
          {
            memberId: peer.memberId,
            connectionId: "c1",
            connectionState: "new",
          },
        ],
      });
    });
  });

  describe("as a subscriber", () => {
    it("subscribes to a member publishing on full mesh", async () => {
      const member = addMember(fullMesh(peer.deviceId));
      await settle();
      expect(sent()).toEqual([
        [
          SignallingEventType.subscribe,
          peer.deviceId,
          expect.objectContaining({
            room_id: roomId,
            slot_id: slotId,
            member_id: own.memberId,
            device_id: own.deviceId,
            target_member_id: peer.memberId,
            seq: 0,
          }),
        ],
      ]);
      expect(member.tracks()).toBeNull();
      expect(backend.connections$.value).toEqual([
        expect.objectContaining({
          transport: fullMesh(peer.deviceId),
          resolved: expect.objectContaining({ role: "subscriber" }),
        }),
      ]);
    });

    it("ignores a full mesh transport advertising another device", async () => {
      addMember(fullMesh("OTHERDEVICE"));
      await settle();
      expect(sent()).toEqual([]);
    });

    it("leaves members on other transports alone", async () => {
      const member = addMember(livekit);
      await settle();
      expect(sent()).toEqual([]);
      expect(member.tracks()).toBeNull();
    });

    it("hands the publisher's messages to the subscription", async () => {
      addMember(fullMesh(peer.deviceId));
      await settle();
      const [[, , subscribe]] = sent();
      lastPeerConnection().receive("video", "user");
      deliver(
        SignallingEventType.description,
        subscribe.connection_id as string,
        {
          description: { type: "offer", sdp: "offer" },
          stream_metadata: { user: { purpose: "m.usermedia" } },
        },
      );
      await settle();
      expect(sent(SignallingEventType.description)).toEqual([
        [
          SignallingEventType.description,
          peer.deviceId,
          expect.objectContaining({
            description: { type: "answer", sdp: "answer" },
          }),
        ],
      ]);
    });

    it("closes the subscription when the member leaves", async () => {
      const member = addMember(fullMesh(peer.deviceId));
      await settle();
      member.scope.end();
      expect(lastPeerConnection().closed).toBe(true);
      expect(backend.connections$.value).toEqual([]);
    });
  });

  it("doesn't take over the delayed leave", async () => {
    await expect(backend.delegateDelayedLeave("id")).rejects.toThrow();
  });

  describe("data", () => {
    it("can't be sent while not publishing", async () => {
      await expect(backend.sendData("topic", "text")).rejects.toThrow();
    });

    it("is sent to every subscriber on its data stream", async () => {
      await backend.prepareLocalTransport(fullMesh(own.deviceId));
      addMember(livekit);
      deliver(SignallingEventType.subscribe, "c1");
      await settle();
      const data = lastPeerConnection().dataChannels.find(
        (c) => c.label === DATA_STREAM_ID,
      )!;
      data.open();
      await backend.sendData("greeting", "hello");
      expect(data.sent.map((m) => JSON.parse(m) as unknown)).toEqual([
        { topic: "greeting", text: "hello" },
      ]);
    });

    it("is received from a publisher, named by its member", async () => {
      const received: DataPacket[] = [];
      backend.data$.subscribe((p) => received.push(p));
      addMember(fullMesh(peer.deviceId));
      await settle();
      const [[, , subscribe]] = sent();
      deliver(
        SignallingEventType.description,
        subscribe.connection_id as string,
        {
          description: { type: "offer", sdp: "offer" },
          stream_metadata: {
            [DATA_STREAM_ID]: {
              purpose: DATA_PURPOSE,
              protocol: DATA_PROTOCOL,
            },
          },
        },
      );
      await settle();
      const channel = lastPeerConnection().announceDataChannel(DATA_STREAM_ID);
      channel.receive({ topic: "greeting", text: "hello" });
      channel.receive({ topic: 1 });
      expect(received).toEqual([
        {
          senderId: `${peer.userId}:${peer.deviceId}`,
          topic: "greeting",
          text: "hello",
        },
      ]);
    });
  });
});

describe("completeFullMeshTransport", () => {
  it("adds our device to a full mesh transport only", () => {
    expect(
      completeFullMeshTransport({ type: FULL_MESH_TRANSPORT_TYPE }, "DEV"),
    ).toEqual({ type: FULL_MESH_TRANSPORT_TYPE, device_id: "DEV" });
    expect(completeFullMeshTransport(livekit, "DEV")).toBe(livekit);
  });
});

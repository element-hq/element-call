/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { EMPTY } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { type MatrixClient, type Room, SyncState } from "matrix-js-sdk";
import { EventType } from "matrix-js-sdk/lib/@types/event";
import { type MatrixEvent } from "matrix-js-sdk/lib/models/event";
import {
  type RoomState,
  RoomStateEvent,
} from "matrix-js-sdk/lib/models/room-state";
import { RoomStickyEventsEvent } from "matrix-js-sdk/lib/models/room-sticky-events";

import {
  MatrixRTCSessionEvent,
  type MatrixRTCSessionEventHandlerMap,
} from "matrix-js-sdk/lib/matrixrtc";

import { createRTCSlot } from "./RTCSlot";
import { type SdkMatrixBackend } from "./SdkMatrixBackend";
import { ObservableScope } from "./reactive/ObservableScope";
import { type RTCParticipationOptions, type RTCSlotOptions } from "./api";
import { MatrixRTCMode } from "./config";
import { E2eeType } from "./encryption";
import { MatrixRTCError } from "./errors";
import { type MediaBackend, MediaConnectionState } from "./media-backend/api";
import { constant } from "./reactive/Behavior";
import {
  mockEmitter,
  mockRtcMembership,
  MockRTCSession,
  testScope,
} from "./utils/test";

const options: RTCSlotOptions = {
  encryptionSystem: { kind: E2eeType.NONE },
};

function setup(): {
  client: MatrixClient;
  room: Room;
  session: MockRTCSession;
} {
  const room = {
    ...mockEmitter(),
    roomId: "!room:example.org",
    getMembersWithMembership: (): [] => [],
    // An empty room, for a session of the slot's own
    getLiveTimeline: () => ({ getState: (): undefined => undefined }),
    hasMembershipState: (): boolean => false,
    getVersion: (): string => "11",
    _unstable_getStickyEvents: (): [] => [],
  } as unknown as Room;
  const session = new MockRTCSession(room);
  const client = {
    ...mockEmitter(),
    getUserId: (): string => "@alice:example.org",
    getDeviceId: (): string => "AAAA",
  } as unknown as MatrixClient;
  return { client, room, session };
}

function backendOf(client: MatrixClient, room: Room): SdkMatrixBackend {
  return {
    ...client,
    ...room,
    clientEmitter: client,
    roomEmitter: room,
  } as unknown as SdkMatrixBackend;
}

/** A media backend whose transport never gets ready: a participation on it stays waiting. */
function idleBackend(): MediaBackend {
  return {
    transportTypes: ["livekit"],
    prepareLocalTransport: async () => new Promise(() => {}),
    delegateDelayedLeave: vi.fn(),
    local: {
      connectionState$: constant(MediaConnectionState.Initialized),
      setPublishing: vi.fn(),
      publishError$: constant(null),
      publish: vi.fn(),
      unpublish: vi.fn(),
      tracks$: constant(null),
      encryptionError$: EMPTY,
    },
    mediaFor: vi.fn(),
    connections$: constant([]),
    setAudioOutputDeviceId: vi.fn(),
    sendData: vi.fn(),
    data$: EMPTY,
  };
}

describe("createRTCSlot", () => {
  describe("session", () => {
    it("joins the room's call slot by default", () => {
      const { client, room } = setup();
      const slot = createRTCSlot(testScope(), backendOf(client, room), options);
      expect(slot).toMatchObject({ application: "m.call", id: "ROOM" });
    });

    it("joins the slot the options name", () => {
      const { client, room } = setup();
      const slot = createRTCSlot(testScope(), backendOf(client, room), {
        ...options,
        slotDescription: { application: "io.element.example", id: "" },
      });
      expect(slot).toMatchObject({ application: "io.element.example", id: "" });
    });

    it("stops its own session when the scope ends", async () => {
      const { client, room } = setup();
      const off = vi.spyOn(room, "off");
      const scope = new ObservableScope();
      createRTCSlot(scope, backendOf(client, room), options);

      scope.end();
      await vi.waitFor(() =>
        expect(off).toHaveBeenCalledWith(
          RoomStickyEventsEvent.Update,
          expect.any(Function),
        ),
      );
    });

    it("leaves a session it is given to its caller", () => {
      const { client, room, session } = setup();
      const given = session.asMockedSession();
      given.stop = vi.fn();
      const scope = new ObservableScope();
      createRTCSlot(scope, backendOf(client, room), options, given);

      scope.end();
      expect(given.stop).not.toHaveBeenCalled();
    });

    it("has the session's statistics and sent call notifications", () => {
      const { client, room, session } = setup();
      const slot = createRTCSlot(
        testScope(),
        backendOf(client, room),
        options,
        session.asMockedSession(),
      );
      expect(slot.statistics).toBe(session.statistics);

      const sent: unknown[] = [];
      slot.sentCallNotification$.subscribe((n) => sent.push(n));
      const notification = { event_id: "$notification" };
      session.emit(
        MatrixRTCSessionEvent.DidSendCallNotification,
        notification as Parameters<
          MatrixRTCSessionEventHandlerMap[MatrixRTCSessionEvent.DidSendCallNotification]
        >[0],
      );
      expect(sent).toEqual([notification]);
    });
  });

  describe("status$", () => {
    it("is undefined while the room has no slot event", () => {
      const { client, room, session } = setup();
      const slot = createRTCSlot(
        testScope(),
        backendOf(client, room),
        options,
        session.asMockedSession(),
      );
      expect(slot.status$.value).toBeUndefined();
    });

    it("follows the slot event", () => {
      const { client, room, session } = setup();
      session.rtcSlot = { status: "open" };
      const slot = createRTCSlot(
        testScope(),
        backendOf(client, room),
        options,
        session.asMockedSession(),
      );
      expect(slot.status$.value).toBe("open");

      session.rtcSlot = { status: "closed" };
      room.emit(
        RoomStateEvent.Events,
        { getType: (): string => EventType.RTCSlot } as MatrixEvent,
        {} as RoomState,
        null,
      );
      expect(slot.status$.value).toBe("closed");
    });
  });

  describe("join", () => {
    it("holds one participation at a time, and is free again once it has left", () => {
      const { client, room, session } = setup();
      const slot = createRTCSlot(
        testScope(),
        backendOf(
          {
            ...client,
            getDomain: (): string => "example.org",
            getSyncState: (): SyncState => SyncState.Syncing,
            getRTCTransports: vi.fn().mockResolvedValue([]),
          } as unknown as MatrixClient,
          room,
        ),
        options,
        session.asMockedSession(),
      );
      const joinOptions: RTCParticipationOptions = {
        publish: [],
        matrixRTCMode: MatrixRTCMode.Compatibility,
        backend: idleBackend,
      };
      expect(slot.participation$.value).toBeNull();

      const participation = slot.join(joinOptions);
      expect(slot.participation$.value).toBe(participation);
      expect(participation.slot).toMatchObject({
        roomId: room.roomId,
        application: "m.call",
        id: "ROOM",
      });
      expect(() => slot.join(joinOptions)).toThrow(MatrixRTCError);

      participation.leave();
      expect(slot.participation$.value).toBeNull();
      const again = slot.join(joinOptions);
      expect(slot.participation$.value).toBe(again);
      again.leave();
    });
  });

  describe("members$", () => {
    it("keeps the member when its membership is sent again, with the new event id", () => {
      const { client, room, session } = setup();
      const first = mockRtcMembership("@bob:example.org", "BOB");
      session.memberships = [first];
      const slot = createRTCSlot(
        testScope(),
        backendOf(client, room),
        options,
        session.asMockedSession(),
      );
      const [bob] = slot.members$.value;
      expect(bob.matrixEventId$.value).toBe(first.eventId);

      const resent = mockRtcMembership("@bob:example.org", "BOB");
      session.memberships = [resent];
      session.emit(MatrixRTCSessionEvent.MembershipsChanged, [first], [resent]);
      expect(slot.members$.value).toHaveLength(1);
      expect(slot.members$.value[0]).toBe(bob);
      expect(bob.matrixEventId$.value).toBe(resent.eventId);
      expect(resent.eventId).not.toBe(first.eventId);
    });
  });
});

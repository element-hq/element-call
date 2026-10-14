/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixClient, type Room, SyncState } from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/lib/logger";
import {
  MatrixRTCSessionEvent,
  MembershipManagerEvent,
  type Transport,
} from "matrix-js-sdk/lib/matrixrtc";
import { BehaviorSubject, EMPTY, Subject } from "rxjs";
import { describe, expect, it, type Mock, vi } from "vitest";

import {
  type DataMessage,
  type ParticipationState,
  type RTCMember,
  type RTCParticipationOptions,
  type RTCSlot,
  type TransportMetadata,
} from "./api";
import { defaultSessionTimings, MatrixRTCMode } from "./config";
import { E2eeType } from "./encryption";
import { MatrixRTCError } from "./errors";
import {
  type DataPacket,
  type MediaBackend,
  type MediaBackendContext,
  MediaConnectionState,
  type MediaKey,
} from "./media-backend/api";
import { type MemberMedia } from "./media-api";
import { constant } from "./reactive/Behavior";
import { ObservableScope } from "./reactive/ObservableScope";
import { createRTCParticipation } from "./RTCParticipation";
import { transportId } from "./matrixrtc/Transports";
import { flushPromises, mockEmitter, MockRTCSession } from "./utils/test";

const transport: Transport = {
  type: "livekit",
  livekit_service_url: "https://lk.example.org",
};
const userId = "@alice:example.org";
const deviceId = "AAAA";
const legacyMemberId = `${userId}:${deviceId}`;

function metadata(raw: Transport): TransportMetadata {
  return {
    type: raw.type,
    id: transportId(raw),
    raw,
    resolved$: constant(undefined),
  };
}

function member(
  overrides: Partial<RTCMember> & Pick<RTCMember, "userId" | "memberId">,
): RTCMember {
  return {
    local: false,
    rtcBackendIdentity: overrides.memberId,
    backendIdentities: [overrides.memberId],
    deviceId: "DEV",
    transport$: constant(metadata(transport)),
    applicationData$: constant({}),
    displayName$: constant(overrides.userId),
    avatarUrl$: constant(undefined),
    ...overrides,
  };
}

const bob = member({ userId: "@bob:example.org", memberId: "bob-member" });
const own = member({ userId, deviceId, memberId: legacyMemberId, local: true });

/** A backend the test drives: it prepares when told, and reports what the participation asked of it. */
interface FakeBackend {
  backend: MediaBackend;
  context: MediaBackendContext;
  prepared: PromiseWithResolvers<{ canDelegateDelayedLeave: boolean }>;
  connectionState$: BehaviorSubject<MediaConnectionState | Error>;
  data$: Subject<DataPacket>;
  setPublishing: Mock<(publish: boolean) => void>;
  findRemotePublishTransport: Mock<() => Promise<Transport | null>>;
  delegateDelayedLeave: Mock<(delayId: string) => Promise<void>>;
  mediaFor: Mock<(scope: ObservableScope, member: RTCMember) => MemberMedia>;
}

function setup(
  options: Partial<RTCParticipationOptions> = {},
  slotOptions: { matrixRTCMode?: MatrixRTCMode } = {},
  homeserverTransports: Transport[] = [transport],
): {
  scope: ObservableScope;
  participation: ReturnType<typeof createRTCParticipation>["participation"];
  session: MockRTCSession;
  mockedSession: ReturnType<MockRTCSession["asMockedSession"]>;
  join: ReturnType<typeof vi.spyOn>;
  members$: BehaviorSubject<RTCMember[]>;
  fake: FakeBackend;
  states: ParticipationState[];
} {
  const scope = new ObservableScope();
  const room = { roomId: "!room:example.org" } as Room;
  const session = new MockRTCSession(room);
  const mockedSession = session.asMockedSession();
  const join = vi.spyOn(session, "join");
  const client = {
    ...mockEmitter(),
    getUserId: () => userId,
    getDeviceId: () => deviceId,
    getDomain: () => "example.org",
    getSyncState: () => SyncState.Syncing,
    _unstable_getRTCTransports: vi.fn().mockResolvedValue(homeserverTransports),
  } as unknown as MatrixClient;
  const members$ = new BehaviorSubject<RTCMember[]>([]);

  const fake: Omit<FakeBackend, "backend" | "context"> &
    Partial<Pick<FakeBackend, "backend" | "context">> = {
    prepared: Promise.withResolvers(),
    connectionState$: new BehaviorSubject<MediaConnectionState | Error>(
      MediaConnectionState.Initialized,
    ),
    data$: new Subject<DataPacket>(),
    setPublishing: vi.fn(),
    findRemotePublishTransport: vi.fn(async () => Promise.resolve(null)),
    delegateDelayedLeave: vi.fn(async () => Promise.resolve()),
    mediaFor: vi.fn(() => ({
      tracks$: constant(null),
      encryptionError$: EMPTY,
    })),
  };
  const backendFactory = (
    backendScope: ObservableScope,
    context: MediaBackendContext,
  ): MediaBackend => {
    const backend: MediaBackend = {
      transportType: "livekit",
      findRemotePublishTransport: fake.findRemotePublishTransport,
      prepareLocalTransport: async () => fake.prepared.promise,
      delegateDelayedLeave: fake.delegateDelayedLeave,
      local: {
        connectionState$: backendScope.behavior(fake.connectionState$),
        setPublishing: fake.setPublishing,
        publishError$: constant(null),
        publish: vi.fn(),
        unpublish: vi.fn(),
        tracks$: constant(null),
        encryptionError$: EMPTY,
      },
      mediaFor: fake.mediaFor,
      connections$: constant([]),
      setAudioOutputDeviceId: vi.fn(),
      sendData: vi.fn(),
      data$: fake.data$,
    };
    fake.context = context;
    fake.backend = backend;
    return backend;
  };

  const { participation } = createRTCParticipation(
    scope,
    {
      client,
      room,
      slot: {} as RTCSlot,
      jsSdkSession: mockedSession,
      members$: scope.behavior(members$),
      transports: { get: metadata, connected$: constant([]) },
      slotOptions: {
        matrixRTCMode: MatrixRTCMode.Compatibility,
        encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
        ...slotOptions,
      },
      logger,
    },
    { publish: [], backend: backendFactory, ...options },
  );
  const states: ParticipationState[] = [];
  participation.state$.subscribe((state) => states.push(state));
  return {
    scope,
    participation,
    session,
    mockedSession,
    join,
    members$,
    fake: fake as FakeBackend,
    states,
  };
}

describe("createRTCParticipation", () => {
  it("joins the session once the transport is prepared, and is connected once the media is", async () => {
    const { participation, join, fake, states } = setup();
    expect(states).toEqual([{ kind: "waitingForTransport" }]);
    await flushPromises();
    expect(join).not.toHaveBeenCalled();

    fake.prepared.resolve({ canDelegateDelayedLeave: false });
    await flushPromises();
    expect(join).toHaveBeenCalledWith(
      { userId, deviceId, memberId: legacyMemberId },
      [transport],
      expect.objectContaining({
        manageMediaKeys: true,
        unstableSendStickyEvents: false,
        delayedLeaveEventDelayMs: defaultSessionTimings.delayedLeave.delay_ms,
      }),
    );
    expect(participation.state$.value).toEqual({ kind: "connecting" });

    fake.connectionState$.next(MediaConnectionState.Connected);
    expect(participation.state$.value).toEqual({ kind: "connected" });

    fake.connectionState$.next(MediaConnectionState.Reconnecting);
    expect(participation.state$.value).toEqual({
      kind: "reconnecting",
      reason: "media",
    });
  });

  it("publishes on another member's SFU where the homeserver advertises none", async () => {
    const bobsTransport: Transport = {
      type: "livekit",
      url: "wss://sfu.bob.com",
      server_name: "bob.com",
    };
    const { session, join, fake } = setup({}, {}, []);
    fake.findRemotePublishTransport.mockResolvedValue(bobsTransport);
    fake.prepared.resolve({ canDelegateDelayedLeave: false });
    await flushPromises();

    expect(fake.findRemotePublishTransport).toHaveBeenCalledWith(
      session.memberships,
    );
    expect(join).toHaveBeenCalledWith(
      expect.anything(),
      [bobsTransport],
      expect.anything(),
    );
  });

  it("publishes only while joined", async () => {
    const { participation, session, fake, scope } = setup();
    const ended = vi.fn();
    scope.onEnd(ended);
    await flushPromises();
    expect(fake.setPublishing).toHaveBeenLastCalledWith(false);

    fake.prepared.resolve({ canDelegateDelayedLeave: false });
    await flushPromises();
    expect(fake.setPublishing).toHaveBeenLastCalledWith(true);

    participation.leave();
    expect(fake.setPublishing).toHaveBeenLastCalledWith(false);
    expect(participation.state$.value).toEqual({ kind: "left" });
    await flushPromises();
    expect(session.leave).toHaveBeenCalled();
    expect(ended).toHaveBeenCalled();
  });

  it("fails where the transport cannot be prepared", async () => {
    const { participation, join, fake } = setup();
    const error = new MatrixRTCError("no token");

    fake.prepared.reject(error);
    await flushPromises();

    expect(participation.state$.value).toEqual({ kind: "failed", error });
    expect(join).not.toHaveBeenCalled();
  });

  it("fails where the media connection fails, and stays failed", async () => {
    const { participation, fake } = setup();
    fake.prepared.resolve({ canDelegateDelayedLeave: false });
    await flushPromises();
    const error = new MatrixRTCError("SFU gone");

    fake.connectionState$.next(error);
    expect(participation.state$.value).toEqual({ kind: "failed", error });

    fake.connectionState$.next(MediaConnectionState.Connected);
    expect(participation.state$.value).toEqual({ kind: "failed", error });
  });

  it("joins with the delegated timings where the backend delegates, and hands it each delay id", async () => {
    const { session, join, fake } = setup({
      timings: { delegatedDelayedLeave: { delay_ms: 7_200_000 } },
    });
    fake.prepared.resolve({ canDelegateDelayedLeave: true });
    await flushPromises();
    expect(join).toHaveBeenCalledWith(
      expect.anything(),
      [transport],
      expect.objectContaining({ delayedLeaveEventDelayMs: 7_200_000 }),
    );
    expect(fake.delegateDelayedLeave).not.toHaveBeenCalled();

    // Re-emitted by the js-sdk session with the membership manager appended
    (
      session as unknown as { emit(event: string, ...args: unknown[]): void }
    ).emit(MembershipManagerEvent.DelayIdChanged, "delay-1", {});
    await flushPromises();

    expect(fake.delegateDelayedLeave).toHaveBeenCalledWith("delay-1");
  });

  it("names the membership `${userId}:${deviceId}` in compatibility mode and by a uuid in Matrix 2.0", () => {
    const compatibility = setup();
    expect(compatibility.fake.context.ownMembershipIdentity).toEqual({
      userId,
      deviceId,
      memberId: legacyMemberId,
    });
    compatibility.scope.end();

    const matrix2 = setup({}, { matrixRTCMode: MatrixRTCMode.Matrix_2_0 });
    const { memberId } = matrix2.fake.context.ownMembershipIdentity;
    expect(memberId).not.toBe(legacyMemberId);
    expect(memberId).toMatch(/^[0-9a-f-]{36}$/);
    matrix2.scope.end();
  });

  it("passes the slot and the join options on to the backend", () => {
    const { fake, scope } = setup({
      publish: [{ source: "camera" }],
      timings: { networkErrorRetryMs: 250 },
    });

    expect(fake.context).toMatchObject({
      roomId: "!room:example.org",
      slotId: "m.call#ROOM",
      publish: [{ source: "camera" }],
      encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
      timings: { ...defaultSessionTimings, networkErrorRetryMs: 250 },
    });
    scope.end();
  });

  it("gives the backend the keys the session holds and the ones that follow", () => {
    const { fake, session, mockedSession, scope } = setup();
    const keys: MediaKey[] = [];
    fake.context.mediaKeys$.subscribe((key) => keys.push(key));
    expect(mockedSession.reemitEncryptionKeys).toHaveBeenCalledOnce();

    const key = new Uint8Array([1, 2, 3]);
    session.emit(
      MatrixRTCSessionEvent.EncryptionKeyChanged,
      key,
      2,
      { userId: "@bob:example.org", deviceId: "DEV", memberId: "bob-member" },
      "bob-member",
    );

    expect(keys).toEqual([{ participantId: "bob-member", index: 2, key }]);
    scope.end();
  });

  it("builds the remote members on the backend's media and the local member on our own membership", () => {
    const { participation, members$, fake, scope } = setup();
    const stale = member({
      userId,
      deviceId,
      memberId: "old-uuid",
      local: true,
    });

    members$.next([own, bob, stale]);

    expect(fake.mediaFor).toHaveBeenCalledTimes(1);
    expect(fake.mediaFor).toHaveBeenCalledWith(expect.anything(), bob);
    expect(participation.remoteMembers$.value.map((m) => m.memberId)).toEqual([
      "bob-member",
    ]);
    expect(participation.localMember$.value).toMatchObject({
      local: true,
      memberId: legacyMemberId,
    });
    scope.end();
  });

  it("delivers data from a member with its member and drops the rest", () => {
    const { participation, members$, fake, scope } = setup();
    members$.next([
      member({
        userId: "@bob:example.org",
        memberId: "bob-member",
        backendIdentities: ["bob-hashed", "bob-member"],
      }),
    ]);
    const messages: DataMessage[] = [];
    participation.data$.subscribe((message) => messages.push(message));

    fake.data$.next({ senderId: "bob-hashed", topic: "chat", text: "hi" });
    fake.data$.next({ senderId: "stranger", topic: "chat", text: "boo" });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      topic: "chat",
      text: "hi",
      member: { memberId: "bob-member" },
    });
    scope.end();
  });

  it("leaves at most once", async () => {
    const { participation, session, fake } = setup();
    fake.prepared.resolve({ canDelegateDelayedLeave: false });
    await flushPromises();

    participation.leave();
    participation.leave();
    await flushPromises();

    expect(session.leave).toHaveBeenCalledOnce();
  });
});

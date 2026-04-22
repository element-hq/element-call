/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/
import { map, type Observable, of, type SchedulerLike } from "rxjs";
import { type RunHelpers, TestScheduler } from "rxjs/testing";
import {
  expect,
  type MockedObject,
  type MockInstance,
  onTestFinished,
  vi,
  vitest,
} from "vitest";
import {
  EventType,
  MatrixEvent,
  type Room as MatrixRoom,
  type Room,
  type RoomMember,
  TypedEventEmitter,
} from "matrix-js-sdk";
import {
  CallMembership,
  type LivekitFocusSelection,
  type LivekitTransport,
  type MatrixRTCSession,
  MatrixRTCSessionEvent,
  type MatrixRTCSessionEventHandlerMap,
  MembershipManagerEvent,
  type SessionMembershipData,
  Status,
  type Transport,
} from "matrix-js-sdk/lib/matrixrtc";
import { type MembershipManagerEventHandlerMap } from "matrix-js-sdk/lib/matrixrtc/IMembershipManager";
import {
  type LocalParticipant,
  type LocalTrackPublication,
  type Participant,
  type RemoteParticipant,
  type RemoteTrackPublication,
  type Room as LivekitRoom,
  Track,
} from "livekit-client";
import { randomUUID } from "crypto";
import { type TrackReference } from "@livekit/components-core";
import EventEmitter from "events";
import {
  type KeyTransportEvents,
  type KeyTransportEventsHandlerMap,
} from "matrix-js-sdk/lib/matrixrtc/IKeyTransport";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";

import { E2eeType } from "../e2ee/e2eeType";
import {
  DEFAULT_CONFIG,
  type ResolvedConfigOptions,
} from "../config/ConfigOptions";
import { Config } from "../config/Config";
import { type MediaDevices } from "../state/MediaDevices";
import { type Behavior, constant } from "../state/Behavior";
import { ObservableScope } from "../state/ObservableScope";
import { MuteStates } from "../state/MuteStates";
import {
  createLocalUserMedia,
  type LocalUserMediaViewModel,
} from "../state/media/LocalUserMediaViewModel";
import {
  createRemoteUserMedia,
  type RemoteUserMediaViewModel,
} from "../state/media/RemoteUserMediaViewModel";
import {
  createRemoteScreenShare,
  type RemoteScreenShareViewModel,
} from "../state/media/RemoteScreenShareViewModel";
import { Connection } from "../state/CallViewModel/remoteMembers/Connection";
import { type SFUConfig } from "../livekit/openIDSFU";

export function withFakeTimers(continuation: () => void): void {
  vi.useFakeTimers();
  try {
    continuation();
  } finally {
    vi.useRealTimers();
  }
}

export async function flushPromises(): Promise<void> {
  await new Promise<void>((resolve) => window.setTimeout(resolve));
}

export type NodeEventHandler = (...args: unknown[]) => void;

export interface NodeStyleEventEmitter {
  addListener(eventName: string | symbol, handler: NodeEventHandler): this;
  removeListener(eventName: string | symbol, handler: NodeEventHandler): this;
}

export interface OurRunHelpers extends RunHelpers {
  /**
   * Schedules a sequence of actions to happen, as described by a marble
   * diagram.
   */
  schedule: (marbles: string, actions: Record<string, () => void>) => void;
  behavior: <T>(
    marbles: string,
    values?: { [marble: string]: T },
    error?: unknown,
  ) => Behavior<T>;
  scope: ObservableScope;
}

interface TestRunnerGlobal {
  rxjsTestScheduler?: SchedulerLike;
}

/**
 * Create a new ObservableScope which ends when the current test ends.
 */
export function testScope(): ObservableScope {
  const scope = new ObservableScope();
  onTestFinished(() => scope.end());
  return scope;
}

/**
 * Run Observables with a scheduler that virtualizes time, for testing purposes.
 */
export function withTestScheduler(
  continuation: (helpers: OurRunHelpers) => void,
): void {
  const scheduler = new TestScheduler((actual, expected) => {
    expect(actual).toStrictEqual(expected);
  });
  const scope = new ObservableScope();
  // we set the test scheduler as a global so that you can watch it in a debugger
  // and get the frame number. e.g. `rxjsTestScheduler?.now()`
  (global as unknown as TestRunnerGlobal).rxjsTestScheduler = scheduler;
  scheduler.run((helpers) =>
    continuation({
      ...helpers,
      scope,
      schedule(marbles, actions) {
        const actionsObservable$ = helpers
          .cold(marbles)
          .pipe(map((value) => actions[value]()));
        const results = Object.fromEntries(
          Object.keys(actions).map((value) => [value, undefined] as const),
        );
        // Run the actions and verify that none of them error
        helpers.expectObservable(actionsObservable$).toBe(marbles, results);
      },
      behavior<T>(
        marbles: string,
        values?: { [marble: string]: T },
        error?: unknown,
      ) {
        // Generate a hot Observable with helpers.hot and use it as a Behavior.
        // To do this, we need to ensure that the initial value emits
        // synchronously upon subscription. The issue is that helpers.hot emits
        // frame 0 of the marble diagram *asynchronously*, only once we return
        // from the continuation, so we need to splice out the initial marble
        // and turn it into a proper initial value.
        const initialMarbleIndex = marbles.search(/[^ ]/);
        if (initialMarbleIndex === -1)
          throw new Error("Behavior must have an initial value");
        const initialMarble = marbles[initialMarbleIndex];
        const initialValue =
          values === undefined ? (initialMarble as T) : values[initialMarble];
        // The remainder of the marble diagram should start on frame 1
        return scope.behavior(
          helpers.hot(
            `-${marbles.slice(initialMarbleIndex + 1)}`,
            values,
            error,
          ),
          initialValue,
        );
      },
    }),
  );
  scope.end();
}

interface EmitterMock<T> {
  on: (...args: unknown[]) => T;
  off: (...args: unknown[]) => T;
  addListener: (...args: unknown[]) => T;
  removeListener: (...args: unknown[]) => T;
  emit: (event: string | symbol, ...args: unknown[]) => boolean;
}

export function mockEmitter<T>(): EmitterMock<T> {
  const ee = new EventEmitter();
  return {
    on: ee.on.bind(ee) as unknown as (...args: unknown[]) => T,
    off: ee.off.bind(ee) as unknown as (...args: unknown[]) => T,
    addListener: ee.addListener.bind(ee) as unknown as (
      ...args: unknown[]
    ) => T,
    removeListener: ee.removeListener.bind(ee) as unknown as (
      ...args: unknown[]
    ) => T,
    emit: ee.emit.bind(ee),
  };
}

export const exampleTransport: LivekitTransport = {
  type: "livekit",
  livekit_service_url: "https://lk.example.org",
  livekit_alias: "!alias:example.org",
};

export const exampleSfuConfig: SFUConfig = {
  jwt: "foo",
  livekitAlias: "bar",
  livekitIdentity: "baz",
  url: "bro",
};

export function mockRtcMembership(
  user: string | RoomMember,
  deviceId: string,
  customOverwrites?: {
    rtcBackendIdentity?: string;
    callId?: string;
    fociPreferred?: Transport[];
    focusActive?: LivekitFocusSelection;
    membership?: Partial<SessionMembershipData>;
  },
): CallMembership {
  // setup defaults based on overwrites and fallback values.
  const { rtcBackendIdentity, callId, fociPreferred, focusActive, membership } =
    {
      fociPreferred: [exampleTransport],
      focusActive: {
        type: "livekit" as const,
        focus_selection: "oldest_membership" as const,
      },
      callId: "",
      membership: {},
      ...customOverwrites,
    };

  const data: SessionMembershipData = {
    application: "m.call",
    call_id: callId,
    device_id: deviceId,
    foci_preferred: fociPreferred,
    focus_active: focusActive,
    ...membership,
  };
  const userId = typeof user === "string" ? user : user.userId;
  const event = new MatrixEvent({
    sender: userId,
    event_id: `$-ev-${randomUUID()}:example.org`,
    type: EventType.GroupCallMemberPrefix,
    content: data,
  });

  const membershipData = CallMembership.membershipDataFromMatrixEvent(event);
  const cms = new CallMembership(
    event,
    membershipData,
    rtcBackendIdentity ?? `${userId}:${deviceId}`,
  );
  vi.mocked(cms).getTransport = vi.fn().mockReturnValue(fociPreferred[0]);

  return cms;
}

export const ownMemberMock: CallMembershipIdentityParts = {
  userId: "@alice:example.org",
  deviceId: "DEVICE",
  memberId: "@alice:example.org:DEVICE",
};
// Maybe it'd be good to move this to matrix-js-sdk? Our testing needs are
// rather simple, but if one util to mock a member is good enough for us, maybe
// it's useful for matrix-js-sdk consumers in general.
export function mockMatrixRoomMember(
  rtcMembership: CallMembership,
  member: Partial<RoomMember> = {},
): RoomMember {
  return {
    ...mockEmitter(),
    userId: rtcMembership.userId,
    getMxcAvatarUrl(): string | undefined {
      return undefined;
    },
    rawDisplayName: rtcMembership.userId,
    ...member,
  } as RoomMember;
}

export function mockMatrixRoom(room: Partial<MatrixRoom>): MatrixRoom {
  return { ...mockEmitter(), ...room } as Partial<MatrixRoom> as MatrixRoom;
}

export function mockLivekitRoom(
  room: Partial<LivekitRoom>,
  {
    remoteParticipants$,
  }: { remoteParticipants$?: Observable<RemoteParticipant[]> } = {},
): LivekitRoom {
  const livekitRoom = {
    options: {},
    setE2EEEnabled: vi.fn(),

    ...mockEmitter(),
    ...room,
  } as Partial<LivekitRoom> as LivekitRoom;
  if (remoteParticipants$) {
    livekitRoom.remoteParticipants = new Map();
    remoteParticipants$.subscribe((newRemoteParticipants) => {
      livekitRoom.remoteParticipants.clear();
      newRemoteParticipants.forEach((p) => {
        livekitRoom.remoteParticipants.set(p.identity, p);
      });
    });
  }

  return livekitRoom;
}

export function mockLocalParticipant(
  participant: Partial<LocalParticipant>,
): LocalParticipant {
  return {
    isLocal: true,
    trackPublications: new Map(),
    publishTrack: vi.fn(),
    unpublishTracks: vi.fn().mockResolvedValue([]),
    createTracks: vi.fn(),
    setMicrophoneEnabled: vi.fn(),
    setCameraEnabled: vi.fn(),
    getTrackPublication: () =>
      ({}) as Partial<LocalTrackPublication> as LocalTrackPublication,
    ...mockEmitter(),
    ...participant,
  } as Partial<LocalParticipant> as LocalParticipant;
}

export function mockLocalMedia(
  rtcMember: CallMembership,
  roomMember: Partial<RoomMember>,
  localParticipant: LocalParticipant,
  mediaDevices: MediaDevices,
): LocalUserMediaViewModel {
  const member = mockMatrixRoomMember(rtcMember, roomMember);
  return createLocalUserMedia(testScope(), {
    id: "local",
    userId: member.userId,
    rtcBackendIdentity: rtcMember.rtcBackendIdentity,
    participant$: constant(localParticipant),
    encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
    livekitRoom$: constant(mockLivekitRoom({ localParticipant })),
    focusUrl$: constant("https://rtc-example.org"),
    mediaDevices,
    displayName$: constant(member.rawDisplayName ?? "nodisplayname"),
    mxcAvatarUrl$: constant(member.getMxcAvatarUrl()),
    handRaised$: constant(null),
    reaction$: constant(null),
  });
}

export function mockRemoteParticipant(
  participant: Partial<RemoteParticipant>,
): RemoteParticipant {
  return {
    isLocal: false,
    setVolume() {},
    getTrackPublication: () =>
      ({}) as Partial<RemoteTrackPublication> as RemoteTrackPublication,
    // this will only get used for `getTrackPublications().length`
    getTrackPublications: () => [0],
    ...mockEmitter(),
    ...participant,
  } as RemoteParticipant;
}

export function mockRemoteMedia(
  rtcMember: CallMembership,
  roomMember: Partial<RoomMember>,
  participant: RemoteParticipant | null,
  livekitRoom: LivekitRoom | undefined = mockLivekitRoom(
    {},
    {
      remoteParticipants$: of(participant ? [participant] : []),
    },
  ),
): RemoteUserMediaViewModel {
  const member = mockMatrixRoomMember(rtcMember, roomMember);
  return createRemoteUserMedia(testScope(), {
    id: "remote",
    userId: member.userId,
    rtcBackendIdentity: rtcMember.rtcBackendIdentity,
    participant$: constant(participant),
    encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
    livekitRoom$: constant(livekitRoom),
    focusUrl$: constant("https://rtc-example.org"),
    pretendToBeDisconnected$: constant(false),
    displayName$: constant(member.rawDisplayName ?? "nodisplayname"),
    mxcAvatarUrl$: constant(member.getMxcAvatarUrl()),
    handRaised$: constant(null),
    reaction$: constant(null),
  });
}

export function mockRemoteScreenShare(
  rtcMember: CallMembership,
  roomMember: Partial<RoomMember>,
  participant: RemoteParticipant | null,
  livekitRoom: LivekitRoom | undefined = mockLivekitRoom(
    {},
    {
      remoteParticipants$: of(participant ? [participant] : []),
    },
  ),
): RemoteScreenShareViewModel {
  const member = mockMatrixRoomMember(rtcMember, roomMember);
  return createRemoteScreenShare(testScope(), {
    id: "screenshare",
    userId: member.userId,
    participant$: constant(participant),
    encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
    livekitRoom$: constant(livekitRoom),
    focusUrl$: constant("https://rtc-example.org"),
    pretendToBeDisconnected$: constant(false),
    displayName$: constant(member.rawDisplayName ?? "nodisplayname"),
    mxcAvatarUrl$: constant(member.getMxcAvatarUrl()),
  });
}

export function mockConfig(
  config: Partial<ResolvedConfigOptions> = {},
): MockInstance<() => ResolvedConfigOptions> {
  const spy = vi.spyOn(Config, "get").mockReturnValue({
    ...DEFAULT_CONFIG,
    ...config,
  });
  // simulate loading the config
  vi.spyOn(Config, "init").mockResolvedValue(void 0);
  return spy;
}

export class MockRTCSession extends TypedEventEmitter<
  MatrixRTCSessionEvent | MembershipManagerEvent | KeyTransportEvents,
  KeyTransportEventsHandlerMap &
    MatrixRTCSessionEventHandlerMap &
    MembershipManagerEventHandlerMap
> {
  public asMockedSession(): MockedObject<MatrixRTCSession> {
    const session = this as unknown as MockedObject<MatrixRTCSession>;

    session.reemitEncryptionKeys = vi
      .fn<() => void>()
      .mockReturnValue(undefined);
    session.getOldestMembership = vi
      .fn<() => CallMembership | undefined>()
      .mockReturnValue(this.memberships[0]);

    return session;
  }

  public readonly statistics = {
    counters: {},
  };

  public leaveRoomSession: ReturnType<typeof vitest.fn> = vitest
    .fn()
    .mockResolvedValue(undefined);

  public constructor(
    public readonly room: Room,
    public memberships: CallMembership[] = [],
  ) {
    super();
  }

  public joined = true;
  public isJoined(): boolean {
    return this.joined;
  }

  public withMemberships(
    rtcMembers$: Behavior<Partial<CallMembership>[]>,
  ): MockRTCSession {
    rtcMembers$.subscribe((m) => {
      const old = this.memberships;
      this.memberships = m as CallMembership[];
      this.emit(
        MatrixRTCSessionEvent.MembershipsChanged,
        old,
        this.memberships,
      );
    });

    return this;
  }

  public updateCallIntent: ReturnType<typeof vitest.fn> = vitest
    .fn()
    .mockImplementation(async () => Promise.resolve());

  private _membershipStatus = Status.Connected;
  public get membershipStatus(): Status {
    return this._membershipStatus;
  }
  public set membershipStatus(value: Status) {
    const prev = this._membershipStatus;
    this._membershipStatus = value;
    if (value !== prev)
      this.emit(MembershipManagerEvent.StatusChanged, prev, value);
  }

  private _probablyLeft = false;
  public get probablyLeft(): boolean {
    return this._probablyLeft;
  }
  public set probablyLeft(value: boolean) {
    const prev = this._probablyLeft;
    this._probablyLeft = value;
    if (value !== prev) this.emit(MembershipManagerEvent.ProbablyLeft, value);
  }

  public async joinRTCSession(): Promise<void> {
    return Promise.resolve();
  }
}

export const mockTrack = (
  participant: Participant,
  kind?: Track.Kind,
  source?: Track.Source,
): TrackReference =>
  ({
    participant,
    publication: {
      kind: kind ?? Track.Kind.Audio,
      source: source ?? Track.Source.Microphone,
      trackSid: `123##${participant.identity}`,
      track: {
        attach: vi.fn(),
        detach: vi.fn(),
        setAudioContext: vi.fn(),
        setWebAudioPlugins: vi.fn(),
        setVolume: vi.fn(),
      },
    },
    track: {},
    source: {},
  }) as unknown as TrackReference;

export const deviceStub = {
  available$: of(new Map<never, never>()),
  selected$: of(undefined),
  select(): void {},
};

export function mockMediaDevices(data: Partial<MediaDevices>): MediaDevices {
  return {
    audioInput: deviceStub,
    audioOutput: deviceStub,
    videoInput: deviceStub,
    ...data,
  } as MediaDevices;
}

export function mockMuteStates(
  joined$: Observable<boolean> = of(true),
): MuteStates {
  const observableScope = new ObservableScope();
  return new MuteStates(observableScope, mockMediaDevices({}), {
    audioEnabled: false,
    videoEnabled: false,
  });
}

export class MockConnection extends Connection {
  public async start(): Promise<void> {}
  public async stop(): Promise<void> {}
}

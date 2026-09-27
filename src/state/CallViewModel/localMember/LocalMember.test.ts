/*
Copyright 2025 Element Creations Ltd.
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  Status as RTCMemberStatus,
  type LivekitTransportConfig,
  type MatrixRTCSession,
} from "matrix-js-sdk/lib/matrixrtc";
import {
  describe,
  expect,
  it,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import { BehaviorSubject, map, of, Subject } from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";
import {
  ParticipantEvent,
  Track,
  type LocalParticipant,
  type LocalTrack,
  type LocalTrackPublication,
} from "livekit-client";
import fetchMock from "fetch-mock";

import { PosthogAnalytics } from "../../../analytics/PosthogAnalytics";
import {
  MatrixRTCMode,
  type ResolvedDelayedLeaveTimings,
} from "../../../config/ConfigOptions";
import { type HomeserverDisconnectReason } from "./HomeserverConnected";
import {
  flushPromises,
  mockConfig,
  mockLivekitRoom,
  mockLocalParticipant,
  mockMuteStates,
  withTestScheduler,
  ownMemberMock,
  testScope,
} from "../../../utils/test";
import {
  TransportState,
  createLocalMembership$,
  enterRTCSession,
  PublishState,
  TrackState,
  getScreenShareCaptureOptions,
  watchScreenShareToggle,
} from "./LocalMember";
import { MatrixRTCTransportMissingError } from "../../../utils/errors";
import { Epoch, ObservableScope } from "../../ObservableScope";
import { constant } from "../../Behavior";
import { ConnectionManagerData } from "../remoteMembers/ConnectionManager";
import { ConnectionState, type Connection } from "../remoteMembers/Connection";
import { type Publisher } from "./Publisher";
import { initializeWidget } from "../../../widget";
import { type HostBridge, nullHostBridge } from "../../../HostBridge";
import { type LocalTransport } from "./LocalTransport";
import * as openIDSFU from "../../../livekit/openIDSFU";
import {
  advancedScreenShare,
  screenShareBitrate,
  screenShareCodec,
  screenShareFramerate,
  screenShareResolution,
} from "../../../settings/settings";

initializeWidget();

const MATRIX_RTC_MODE = MatrixRTCMode.Compatibility;
const getUrlParams = vi.hoisted(() => vi.fn(() => ({})));
vi.mock("../../../UrlParams", () => ({ getUrlParams }));
vi.mock("@livekit/components-core", () => ({
  observeParticipantEvents: vi
    .fn()
    .mockReturnValue(of({ isScreenShareEnabled: false })),
}));

describe("watchScreenShareToggle", () => {
  it("reports nothing when the toggle completes", async () => {
    const onError = vi.fn();
    watchScreenShareToggle(Promise.resolve(), true, logger, onError);
    await flushPromises();
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports failures other than the user cancelling", async () => {
    const onError = vi.fn();
    const e = new Error("NotReadableError");
    watchScreenShareToggle(Promise.reject(e), true, logger, onError);
    await flushPromises();
    expect(onError).toHaveBeenCalledWith(e);
  });

  it("does not report the user cancelling the picker", async () => {
    const onError = vi.fn();
    const cancelled = new DOMException("Permission denied", "NotAllowedError");
    watchScreenShareToggle(Promise.reject(cancelled), true, logger, onError);
    await flushPromises();
    expect(onError).not.toHaveBeenCalled();
  });
});

const timings: ResolvedDelayedLeaveTimings = {
  delay_ms: 10000,
  restart_ms: 4000,
  restart_timeout_ms: 1000,
};

const delegatedTimings: ResolvedDelayedLeaveTimings = {
  delay_ms: timings.delay_ms * 10,
  restart_ms: timings.restart_ms! * 10,
  restart_timeout_ms: timings.restart_timeout_ms! * 10,
};

const mockedClient = {
  getDomain: vi.fn().mockReturnValue("example.org"),
  getDeviceId: vi.fn().mockReturnValue("AAAA"),
  getOpenIdToken: vi.fn().mockResolvedValue({
    access_token: "ACCCESS_TOKEN",
    token_type: "Bearer",
    matrix_server_name: "localhost",
    expires_in: 10000,
  }),
};

describe("enterRTCSession", () => {
  const transport: LivekitTransportConfig = {
    livekit_alias: "roomId",
    livekit_service_url: "http://my-livekit-service-url.com",
    type: "livekit",
  };

  const options = {
    encryptMedia: true,
    matrixRTCMode: MATRIX_RTC_MODE,
    delayedLeaveTimings: timings,
  };

  const mockedSession = vi.mocked({
    room: {
      roomId: "roomId",
      client: mockedClient,
    },
    memberships: [],
    joinRTCSession: vi.fn(),
  }) as unknown as MatrixRTCSession;

  beforeEach(() =>
    mockConfig({
      livekit: { livekit_service_url: "http://my-default-service-url.com" },
    }),
  );

  it("It joins the correct Session", () => {
    enterRTCSession(mockedSession, ownMemberMock, transport, options);

    expect(mockedSession.joinRTCSession).toHaveBeenLastCalledWith(
      {
        deviceId: "DEVICE",
        memberId: "@alice:example.org:DEVICE",
        userId: "@alice:example.org",
      },
      [],
      transport,
      expect.objectContaining({ manageMediaKeys: true }),
    );
  });

  it("passes keyRotationParticipantLimit from config to joinRTCSession", () => {
    mockConfig({
      livekit: { livekit_service_url: "http://my-default-service-url.com" },
      matrix_rtc_session: {
        network_error_retry_ms: 0,
        key_rotation_participant_limit: 50,
        delayed_leave: timings,
        delegated_delayed_leave: timings,
      },
    });

    enterRTCSession(mockedSession, ownMemberMock, transport, options);

    expect(mockedSession.joinRTCSession).toHaveBeenLastCalledWith(
      expect.any(Object),
      [],
      expect.any(Object),
      expect.objectContaining({
        keyRotationParticipantLimit: 50,
      }),
    );
  });

  it("uses the specified delayed leave timings", () => {
    enterRTCSession(mockedSession, ownMemberMock, transport, options);

    expect(mockedSession.joinRTCSession).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        delayedLeaveEventRestartMs: timings.restart_ms,
        delayedLeaveEventDelayMs: timings.delay_ms,
        delayedLeaveEventRestartLocalTimeoutMs: timings.restart_timeout_ms,
      }),
    );
  });
});

describe("LocalMembership", () => {
  describe("screen-share capture options", () => {
    it("preserves the ordinary capture constraints", () => {
      expect(getScreenShareCaptureOptions(false)).toEqual({
        audio: {
          autoGainControl: false,
          noiseSuppression: false,
          voiceIsolation: false,
        },
        selfBrowserSurface: "include",
        surfaceSwitching: "include",
        systemAudio: "include",
      });
    });

    it("adds high-fidelity constraints only for isolated audio", () => {
      expect(getScreenShareCaptureOptions(true).audio).toEqual({
        autoGainControl: false,
        noiseSuppression: false,
        voiceIsolation: false,
        echoCancellation: false,
        channelCount: { ideal: 2 },
      });
    });
  });

  const defaultCreateLocalMemberValues = {
    options: constant({
      encryptMedia: false,
      matrixRTCMode: MatrixRTCMode.Matrix_2_0,
    }),
    matrixRTCSession: {
      updateCallIntent: vi.fn().mockReturnValue(Promise.resolve()),
      leaveRoomSession: vi.fn(),
    } as unknown as MatrixRTCSession,
    muteStates: mockMuteStates(),
    trackProcessorState$: constant({
      supported: false,
      processor: undefined,
    }),
    logger: logger,
    createPublisherFactory: vi.fn(),
    joinMatrixRTC: async (): Promise<void> => {},
    homeserverConnected: {
      combined$: constant<[boolean, HomeserverDisconnectReason | null]>([
        true,
        null,
      ]),
      rtsSession$: constant(RTCMemberStatus.Connected),
    },
    roomId: "!test-room-id:example.org",
    hideScreensharing: false,
    hostBridge: nullHostBridge,
    baseUrl: "https://matrix.example.org",
    ownMembershipIdentity: ownMemberMock,
    client: mockedClient,
    delayId$: constant(null),
    matrixRTCMode: MATRIX_RTC_MODE,
  };

  beforeEach(() => {
    mockConfig({
      livekit: { livekit_service_url: "http://my-default-service-url.com" },
      matrix_rtc_session: {
        network_error_retry_ms: 1000,
        delayed_leave: timings,
        delegated_delayed_leave: delegatedTimings,
      },
    });
    fetchMock.catch(404);
  });

  afterEach(async () => {
    void (await fetchMock.flush());
    fetchMock.reset();
  });

  it("throws error on missing RTC config error", () => {
    withTestScheduler(({ scope, hot, expectObservable }) => {
      const localTransport$ = scope.behavior<null | LivekitTransportConfig>(
        hot("1ms #", {}, new MatrixRTCTransportMissingError("domain.com")),
        null,
      );

      // we do not need any connection data since we want to fail before reaching that.
      const mockConnectionManager = {
        transports$: scope.behavior(
          localTransport$.pipe(map((t) => new Epoch([t]))),
        ),
        connectionManagerData$: constant(
          new Epoch(new ConnectionManagerData()),
        ),
      };

      const localMembership = createLocalMembership$({
        scope,
        ...defaultCreateLocalMemberValues,
        connectionManager: mockConnectionManager,
        localTransport$: hot(
          "1ms #",
          {},
          new MatrixRTCTransportMissingError("domain.com"),
        ),
      });

      expectObservable(localMembership.localMemberState$).toBe("ne", {
        n: TransportState.Waiting,
        e: expect.toSatisfy((e) => e instanceof MatrixRTCTransportMissingError),
      });
    });
  });

  it("logs if callIntent cannot be updated", async () => {
    const scope = new ObservableScope();

    const mockConnectionManager = {
      transports$: constant(new Epoch([])),
      connectionManagerData$: constant(new Epoch(new ConnectionManagerData())),
    };
    async function reject(): Promise<void> {
      return Promise.reject(new Error("Not connected yet"));
    }
    const localMembership = createLocalMembership$({
      scope,
      ...defaultCreateLocalMemberValues,
      matrixRTCSession: {
        updateCallIntent: vi.fn().mockImplementation(reject),
        leaveRoomSession: vi.fn(),
      },
      connectionManager: mockConnectionManager,
      localTransport$: constant(mockTransport),
    });
    const expextedLog =
      "'not connected yet' while updating the call intent (this is expected on startup)";
    const internalLogger = vi.spyOn(localMembership.internalLoggerRef, "debug");

    await flushPromises();
    defaultCreateLocalMemberValues.muteStates.video.setEnabled$.value?.(true);
    expect(internalLogger).toHaveBeenCalledWith(expextedLog);
    scope.end();
  });

  const mockTransportConfig = {
    livekit_service_url: "a",
  } as LivekitTransportConfig;

  const mockTransport = {
    transport: mockTransportConfig,
    sfuConfig: {
      jwt: "foo",
      livekitAlias: "bar",
      livekitIdentity: "baz",
      url: "bro",
    },
  } as LocalTransport;

  const connectionTransportAConnected = {
    livekitRoom: mockLivekitRoom({
      localParticipant: {
        isScreenShareEnabled: false,
        trackPublications: [],
      } as unknown as LocalParticipant,
    }),
    state$: constant(ConnectionState.LivekitConnected),
    transport: mockTransportConfig,
  } as Connection;
  const connectionTransportAConnecting = {
    ...connectionTransportAConnected,
    state$: constant(ConnectionState.LivekitConnecting),
    livekitRoom: mockLivekitRoom({}),
  } as unknown as Connection;

  const authCallSpy = vi
    .spyOn(openIDSFU, "getSFUConfigWithOpenID")
    .mockImplementation(() => mockedClient.getOpenIdToken());
  afterEach(() => authCallSpy.mockClear());

  it.each([
    ["no", null, timings],
    [
      "homeserver",
      "https://matrix.example.org/_matrix/client/unstable/io.element.msc4195/rtc/livekit/delegate_delayed_leave",
      delegatedTimings,
    ],
    ["transport", "/a/delegate_delayed_leave", delegatedTimings],
  ])(
    "joins session with %s delegation support",
    async (_serviceName, delegationUrl, delayedLeaveTimings) => {
      const scope = testScope();
      const joinMatrixRTC = vi.fn();
      const delayId$ = new BehaviorSubject<string | null>(null);

      if (delegationUrl !== null)
        fetchMock.post(delegationUrl, () => ({ status: 401, body: {} }));

      const localMembership = createLocalMembership$({
        scope,
        ...defaultCreateLocalMemberValues,
        connectionManager: {
          connectionManagerData$: constant(
            new Epoch(new ConnectionManagerData()),
          ),
        },
        joinMatrixRTC,
        localTransport$: constant(mockTransport),
        delayId$,
      });

      localMembership.requestJoinAndPublish();
      void (await fetchMock.flush());
      await flushPromises();
      // Joins with timings appropriate for the level of delegation support
      expect(joinMatrixRTC).toHaveBeenCalledWith(
        mockTransportConfig,
        delayedLeaveTimings,
      );

      expect(authCallSpy).not.toHaveBeenCalled();
      delayId$.next("leave1");
      await flushPromises();
      if (delegationUrl === null) {
        expect(authCallSpy).not.toHaveBeenCalled();
      } else {
        // Delegation is supported in this test case, so go on to check that
        // LocalMember actually performs delegation
        const expectDelegation = (delayId: string) =>
          expect(authCallSpy).toHaveBeenLastCalledWith(
            mockedClient,
            ownMemberMock,
            "a",
            "!test-room-id:example.org",
            {
              matrixRTCMode: MATRIX_RTC_MODE,
              delayEndpointBaseUrl: "https://matrix.example.org",
              delayId,
            },
            expect.anything(),
          );

        expectDelegation("leave1");
        delayId$.next("leave2"); // Can change delegated leaves
        await flushPromises();
        expectDelegation("leave2");
      }
    },
  );

  it("only starts tracks if requested", async () => {
    const scope = new ObservableScope();

    const publishers: Publisher[] = [];

    const tracks$ = new BehaviorSubject<LocalTrack[]>([]);
    const publishing$ = constant<boolean>(false);
    defaultCreateLocalMemberValues.createPublisherFactory.mockImplementation(
      () => {
        const p = {
          // It is enought to check if destroy is called. Destroy itself is tested in the publisher to make sure it does
          // all the cleanup we need.
          destroy: vi.fn(),
          createAndSetupTracks: vi.fn().mockImplementation(async () => {
            tracks$.next([{}, {}] as LocalTrack[]);
            return Promise.resolve();
          }),
          tracks$,
          publishing$,
        };
        publishers.push(p as unknown as Publisher);
        return p;
      },
    );
    const publisherFactory =
      defaultCreateLocalMemberValues.createPublisherFactory as ReturnType<
        typeof vi.fn
      >;

    const connectionManagerData = new ConnectionManagerData();
    connectionManagerData.add(connectionTransportAConnected, []);
    // connectionManagerData.add(connectionTransportB, []);
    const localMembership = createLocalMembership$({
      scope,
      ...defaultCreateLocalMemberValues,
      connectionManager: {
        connectionManagerData$: constant(new Epoch(connectionManagerData)),
      },
      localTransport$: constant(mockTransport),
    });
    await flushPromises();
    expect(publisherFactory).toHaveBeenCalledOnce();
    // expect(localMembership.tracks$.value.length).toBe(0);
    expect(publishers[0].createAndSetupTracks).not.toHaveBeenCalled();
    localMembership.startTracks();
    await flushPromises();
    expect(publishers[0].createAndSetupTracks).toHaveBeenCalled();

    scope.end();
    await flushPromises();
    // stop all tracks after ending scopes
    expect(publishers[0].destroy).toHaveBeenCalled();
    // expect(publishers[0].stopTracks).toHaveBeenCalled();
    publisherFactory.mockClear();
  });
  // TODO add an integration test combining publisher and localMembership
  //
  it("tracks livekit state correctly", async () => {
    const scope = new ObservableScope();
    const connectionManagerData = new ConnectionManagerData();
    const localTransport$ = new Subject<LocalTransport>();

    const connectionManagerData$ = new BehaviorSubject(
      new Epoch(connectionManagerData),
    );
    const publishers: Publisher[] = [];

    const publishing$ = new BehaviorSubject<boolean>(false);
    const createTrackResolver = Promise.withResolvers<void>();
    const publishResolver = Promise.withResolvers<void>();
    defaultCreateLocalMemberValues.createPublisherFactory.mockImplementation(
      () => {
        const p = {
          // It is enought to check if destroy is called. Destroy itself is tested in the publisher to make sure it does
          // all the cleanup we need.
          destroy: vi.fn(),
          createAndSetupTracks: vi.fn().mockImplementation(async () => {
            await createTrackResolver.promise;
          }),
          startPublishing: vi.fn().mockImplementation(async () => {
            await publishResolver.promise;
            publishing$.next(true);
          }),
          publishing$,
        };
        publishers.push(p as unknown as Publisher);
        return p;
      },
    );

    const publisherFactory =
      defaultCreateLocalMemberValues.createPublisherFactory as ReturnType<
        typeof vi.fn
      >;

    const localMembership = createLocalMembership$({
      scope,
      ...defaultCreateLocalMemberValues,
      connectionManager: {
        connectionManagerData$,
      },
      localTransport$,
    });

    await flushPromises();
    expect(localMembership.localMemberState$.value).toStrictEqual(
      TransportState.Waiting,
    );
    localTransport$.next(mockTransport);
    await flushPromises();
    expect(localMembership.localMemberState$.value).toStrictEqual({
      matrix: RTCMemberStatus.Connected,
      media: { connection: null, tracks: TrackState.WaitingForUser },
    });

    const connectionManagerData2 = new ConnectionManagerData();
    connectionManagerData2.add(
      // clone because we will mutate this later.
      { ...connectionTransportAConnecting } as unknown as Connection,
      [],
    );

    connectionManagerData$.next(new Epoch(connectionManagerData2));
    await flushPromises();
    expect(localMembership.localMemberState$.value).toStrictEqual({
      matrix: RTCMemberStatus.Connected,
      media: {
        connection: ConnectionState.LivekitConnecting,
        tracks: TrackState.WaitingForUser,
      },
    });

    (
      connectionManagerData2.getConnectionForTransport(mockTransportConfig)!
        .state$ as BehaviorSubject<ConnectionState>
    ).next(ConnectionState.LivekitConnected);
    expect(localMembership.localMemberState$.value).toStrictEqual({
      matrix: RTCMemberStatus.Connected,
      media: {
        connection: ConnectionState.LivekitConnected,
        tracks: TrackState.WaitingForUser,
      },
    });

    expect(publisherFactory).toHaveBeenCalledOnce();
    // expect(localMembership.tracks$.value.length).toBe(0);

    // -------
    localMembership.startTracks();
    // -------

    await flushPromises();
    // expect(localMembership.localMemberState$.value).toStrictEqual({
    //   matrix: RTCMemberStatus.Connected,
    //   media: {
    //     tracks: TrackState.Creating,
    //     connection: ConnectionState.LivekitConnected,
    //   },
    // });
    createTrackResolver.resolve();
    await flushPromises();
    expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (localMembership.localMemberState$.value as any).media,
    ).toStrictEqual(PublishState.WaitingForUser);

    // -------
    localMembership.requestJoinAndPublish();
    // -------

    expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (localMembership.localMemberState$.value as any).media,
    ).toStrictEqual(PublishState.Publishing);

    publishResolver.resolve();
    await flushPromises();
    expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (localMembership.localMemberState$.value as any).media,
    ).toStrictEqual(PublishState.Publishing);

    expect(publishers[0].destroy).not.toHaveBeenCalled();

    expect(localMembership.localMemberState$.isStopped).toBe(false);
    scope.end();
    await flushPromises();
    // stays in connected state because it is stopped before the update to tracks update the state.
    expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (localMembership.localMemberState$.value as any).media,
    ).toStrictEqual(PublishState.Publishing);
    // stop all tracks after ending scopes
    expect(publishers[0].destroy).toHaveBeenCalled();
    // expect(publishers[0].stopTracks).toHaveBeenCalled();
  });
  // TODO add tests for matrix local matrix participation.

  describe("reconnecting analytics", () => {
    beforeAll(() => {
      mockConfig();
    });

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterAll(() => {
      PosthogAnalytics.resetInstance();
    });

    it("does not fire CallReconnecting for the initial non-connected state at startup", async () => {
      const scope = new ObservableScope();
      const trackSpy = vi.spyOn(
        PosthogAnalytics.instance.eventCallReconnecting,
        "track",
      );

      // Simulate startup where membership isn't established yet
      const hsReason$ = new BehaviorSubject<
        [boolean, HomeserverDisconnectReason | null]
      >([false, "membership"]);

      const connectionManagerData = new ConnectionManagerData();
      connectionManagerData.add(connectionTransportAConnected, []);

      createLocalMembership$({
        scope,
        ...defaultCreateLocalMemberValues,
        homeserverConnected: {
          combined$: hsReason$,
          rtsSession$: constant(RTCMemberStatus.Connected),
        },
        connectionManager: {
          connectionManagerData$: constant(new Epoch(connectionManagerData)),
        },
        localTransport$: constant(mockTransport),
      });

      await flushPromises();

      // Membership is established — call is now connected
      hsReason$.next([true, null]);

      expect(trackSpy).not.toHaveBeenCalled();

      scope.end();
    });

    it("fires CallReconnecting with homeserver reason and duration when reconnected", async () => {
      const scope = new ObservableScope();
      const trackSpy = vi.spyOn(
        PosthogAnalytics.instance.eventCallReconnecting,
        "track",
      );

      const hsReason$ = new BehaviorSubject<
        [boolean, HomeserverDisconnectReason | null]
      >([true, null]);

      const connectionManagerData = new ConnectionManagerData();
      connectionManagerData.add(connectionTransportAConnected, []);

      createLocalMembership$({
        scope,
        ...defaultCreateLocalMemberValues,
        homeserverConnected: {
          combined$: hsReason$,
          rtsSession$: constant(RTCMemberStatus.Connected),
        },
        connectionManager: {
          connectionManagerData$: constant(new Epoch(connectionManagerData)),
        },
        localTransport$: constant(mockTransport),
      });

      await flushPromises();

      hsReason$.next([false, "sync"]);
      hsReason$.next([true, null]);

      expect(trackSpy).toHaveBeenCalledWith(
        defaultCreateLocalMemberValues.roomId,
        "sync",
        expect.any(Number),
      );

      scope.end();
    });

    it("reports livekit reason when livekit disconnects then reconnects", async () => {
      const scope = new ObservableScope();
      const trackSpy = vi.spyOn(
        PosthogAnalytics.instance.eventCallReconnecting,
        "track",
      );

      const connectionState$ = new BehaviorSubject<ConnectionState>(
        ConnectionState.LivekitConnected,
      );
      const mutableConnection = {
        ...connectionTransportAConnected,
        state$: connectionState$,
      } as unknown as Connection;

      const connectionManagerData = new ConnectionManagerData();
      connectionManagerData.add(mutableConnection, []);

      createLocalMembership$({
        scope,
        ...defaultCreateLocalMemberValues,
        homeserverConnected: {
          combined$: constant<[boolean, HomeserverDisconnectReason | null]>([
            true,
            null,
          ]),
          rtsSession$: constant(RTCMemberStatus.Connected),
        },
        connectionManager: {
          connectionManagerData$: constant(new Epoch(connectionManagerData)),
        },
        localTransport$: constant(mockTransport),
      });

      await flushPromises();

      connectionState$.next(ConnectionState.LivekitDisconnected);
      connectionState$.next(ConnectionState.LivekitConnected);

      expect(trackSpy).toHaveBeenCalledWith(
        defaultCreateLocalMemberValues.roomId,
        "livekit",
        expect.any(Number),
      );

      scope.end();
    });

    it("fires one event per completed reconnection cycle", async () => {
      const scope = new ObservableScope();
      const trackSpy = vi.spyOn(
        PosthogAnalytics.instance.eventCallReconnecting,
        "track",
      );

      const hsReason$ = new BehaviorSubject<
        [boolean, HomeserverDisconnectReason | null]
      >([true, null]);

      const connectionManagerData = new ConnectionManagerData();
      connectionManagerData.add(connectionTransportAConnected, []);

      createLocalMembership$({
        scope,
        ...defaultCreateLocalMemberValues,
        homeserverConnected: {
          combined$: hsReason$,
          rtsSession$: constant(RTCMemberStatus.Connected),
        },
        connectionManager: {
          connectionManagerData$: constant(new Epoch(connectionManagerData)),
        },
        localTransport$: constant(mockTransport),
      });

      await flushPromises();

      hsReason$.next([false, "membership"]);
      hsReason$.next([true, null]);

      hsReason$.next([false, "probablyLeft"]);
      hsReason$.next([false, "sync"]);
      hsReason$.next([false, "membership"]);
      hsReason$.next([true, null]);

      expect(trackSpy).toHaveBeenCalledTimes(2);
      expect(trackSpy).toHaveBeenNthCalledWith(
        1,
        defaultCreateLocalMemberValues.roomId,
        "membership",
        expect.any(Number),
      );
      expect(trackSpy).toHaveBeenNthCalledWith(
        2,
        defaultCreateLocalMemberValues.roomId,
        "probablyLeft",
        expect.any(Number),
      );

      scope.end();
    });
  });

  describe("toggleScreenSharing", () => {
    let originalMediaDevices: MediaDevices | undefined;

    beforeAll(() => {
      mockConfig();
      // Screen sharing is only offered when getDisplayMedia is available.
      originalMediaDevices = navigator.mediaDevices;
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: { getDisplayMedia: vi.fn() },
      });
    });

    afterAll(() => {
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: originalMediaDevices,
      });
    });

    const createMembershipWithConnection = (
      connection: Connection | null,
      hostBridge = nullHostBridge,
    ): {
      scope: ObservableScope;
      localMembership: ReturnType<typeof createLocalMembership$>;
    } => {
      const scope = new ObservableScope();
      const connectionManagerData = new ConnectionManagerData();
      if (connection) connectionManagerData.add(connection, []);
      const localMembership = createLocalMembership$({
        scope,
        ...defaultCreateLocalMemberValues,
        hostBridge,
        connectionManager: {
          connectionManagerData$: constant(new Epoch(connectionManagerData)),
        },
        localTransport$: constant(mockTransport),
      });
      return { scope, localMembership };
    };

    const publication = (source: Track.Source): LocalTrackPublication =>
      ({ source, track: {} }) as unknown as LocalTrackPublication;

    const isolatedHost = (
      acquire = vi.fn().mockResolvedValue(true),
      release = vi.fn().mockResolvedValue(true),
    ): HostBridge => ({
      ...nullHostBridge,
      supportsIsolatedScreenShareAudio: true,
      acquireIsolatedScreenShareAudio: acquire,
      releaseIsolatedScreenShareAudio: release,
    });

    it("uses isolated constraints only after host acquisition and releases on unshare", async () => {
      const acquire = vi.fn().mockResolvedValue(true);
      const release = vi.fn().mockResolvedValue(true);
      const setScreenShareEnabled = vi.fn().mockResolvedValue(undefined);
      const participant = mockLocalParticipant({
        isScreenShareEnabled: false,
        setScreenShareEnabled,
        getTrackPublication: vi.fn((source) => publication(source)),
      });
      const connection = {
        state$: constant(ConnectionState.LivekitConnected),
        transport: mockTransportConfig,
        livekitRoom: mockLivekitRoom({ localParticipant: participant }),
      } as unknown as Connection;
      const { scope, localMembership } = createMembershipWithConnection(
        connection,
        {
          ...nullHostBridge,
          supportsIsolatedScreenShareAudio: true,
          acquireIsolatedScreenShareAudio: acquire,
          releaseIsolatedScreenShareAudio: release,
        },
      );
      await flushPromises();

      localMembership.toggleScreenSharing!();
      await flushPromises();
      expect(acquire).toHaveBeenCalledWith(expect.any(String));
      expect(setScreenShareEnabled).toHaveBeenCalledWith(
        true,
        expect.objectContaining({
          audio: expect.objectContaining({
            echoCancellation: false,
            channelCount: { ideal: 2 },
          }),
        }),
        undefined,
      );

      localMembership.toggleScreenSharing!();
      await flushPromises();
      expect(setScreenShareEnabled).toHaveBeenLastCalledWith(
        false,
        expect.objectContaining({
          audio: expect.not.objectContaining({ echoCancellation: false }),
        }),
        undefined,
      );
      expect(release).toHaveBeenCalledOnce();
      scope.end();
      await flushPromises();
      expect(release).toHaveBeenCalledOnce();
    });

    it("preserves advanced screen-share video settings", async () => {
      advancedScreenShare.setValue(true);
      screenShareResolution.setValue("1280x720");
      screenShareFramerate.setValue(24);
      screenShareBitrate.setValue(2_500_000);
      screenShareCodec.setValue("vp8");
      const setScreenShareEnabled = vi.fn().mockResolvedValue(undefined);
      const connection = {
        state$: constant(ConnectionState.LivekitConnected),
        transport: mockTransportConfig,
        livekitRoom: mockLivekitRoom({
          localParticipant: mockLocalParticipant({
            isScreenShareEnabled: false,
            setScreenShareEnabled,
            getTrackPublication: vi.fn((source) => publication(source)),
          }),
        }),
      } as unknown as Connection;
      const { scope, localMembership } = createMembershipWithConnection(
        connection,
        isolatedHost(),
      );

      try {
        await flushPromises();
        localMembership.toggleScreenSharing!();
        await flushPromises();
        expect(setScreenShareEnabled).toHaveBeenCalledWith(
          true,
          expect.objectContaining({
            resolution: { width: 1280, height: 720, frameRate: 24 },
          }),
          {
            screenShareEncoding: {
              maxBitrate: 2_500_000,
              maxFramerate: 24,
            },
            videoCodec: "vp8",
          },
        );
      } finally {
        scope.end();
        advancedScreenShare.setValue(false);
        screenShareResolution.setValue("1920x1080");
        screenShareFramerate.setValue(30);
        screenShareBitrate.setValue(5_000_000);
        screenShareCodec.setValue("vp9");
      }
    });

    it("falls back to ordinary constraints when host acquisition is rejected", async () => {
      const setScreenShareEnabled = vi.fn().mockResolvedValue(undefined);
      const connection = {
        state$: constant(ConnectionState.LivekitConnected),
        transport: mockTransportConfig,
        livekitRoom: mockLivekitRoom({
          localParticipant: mockLocalParticipant({
            isScreenShareEnabled: false,
            setScreenShareEnabled,
            getTrackPublication: vi.fn((source) => publication(source)),
          }),
        }),
      } as unknown as Connection;
      const { scope, localMembership } = createMembershipWithConnection(
        connection,
        {
          ...nullHostBridge,
          supportsIsolatedScreenShareAudio: true,
          acquireIsolatedScreenShareAudio: vi.fn().mockResolvedValue(false),
        },
      );
      await flushPromises();

      localMembership.toggleScreenSharing!();
      await flushPromises();
      expect(setScreenShareEnabled).toHaveBeenCalledWith(
        true,
        expect.objectContaining({
          audio: expect.not.objectContaining({ echoCancellation: false }),
        }),
        undefined,
      );
      scope.end();
    });

    it.each([Track.Source.ScreenShare, Track.Source.ScreenShareAudio])(
      "releases the owned session when the %s publication is lost",
      async (source) => {
        const release = vi.fn().mockResolvedValue(true);
        const participant = mockLocalParticipant({
          isScreenShareEnabled: false,
          setScreenShareEnabled: vi.fn().mockResolvedValue(undefined),
          getTrackPublication: vi.fn((trackSource) => publication(trackSource)),
        });
        const connection = {
          state$: constant(ConnectionState.LivekitConnected),
          transport: mockTransportConfig,
          livekitRoom: mockLivekitRoom({ localParticipant: participant }),
        } as unknown as Connection;
        const { scope, localMembership } = createMembershipWithConnection(
          connection,
          isolatedHost(undefined, release),
        );
        await flushPromises();
        localMembership.toggleScreenSharing!();
        await flushPromises();

        participant.emit(
          ParticipantEvent.LocalTrackUnpublished,
          publication(source),
        );
        await flushPromises();
        expect(release).toHaveBeenCalledOnce();
        scope.end();
        await flushPromises();
        expect(release).toHaveBeenCalledOnce();
      },
    );

    it("releases on start failure and missing screen-share audio", async () => {
      for (const participant of [
        mockLocalParticipant({
          isScreenShareEnabled: false,
          setScreenShareEnabled: vi.fn().mockRejectedValue(new Error("failed")),
        }),
        mockLocalParticipant({
          isScreenShareEnabled: false,
          setScreenShareEnabled: vi.fn().mockResolvedValue(undefined),
          getTrackPublication: vi.fn((source) =>
            source === Track.Source.ScreenShare
              ? publication(source)
              : undefined,
          ),
        }),
      ]) {
        const release = vi.fn().mockResolvedValue(true);
        const connection = {
          state$: constant(ConnectionState.LivekitConnected),
          transport: mockTransportConfig,
          livekitRoom: mockLivekitRoom({ localParticipant: participant }),
        } as unknown as Connection;
        const { scope, localMembership } = createMembershipWithConnection(
          connection,
          isolatedHost(undefined, release),
        );
        await flushPromises();
        localMembership.toggleScreenSharing!();
        await flushPromises();
        expect(release).toHaveBeenCalledOnce();
        scope.end();
      }
    });

    it("releases on scope teardown", async () => {
      const release = vi.fn().mockResolvedValue(true);
      const connection = {
        state$: constant(ConnectionState.LivekitConnected),
        transport: mockTransportConfig,
        livekitRoom: mockLivekitRoom({
          localParticipant: mockLocalParticipant({
            isScreenShareEnabled: false,
            setScreenShareEnabled: vi.fn().mockResolvedValue(undefined),
            getTrackPublication: vi.fn((source) => publication(source)),
          }),
        }),
      } as unknown as Connection;
      const { scope, localMembership } = createMembershipWithConnection(
        connection,
        isolatedHost(undefined, release),
      );
      await flushPromises();
      localMembership.toggleScreenSharing!();
      await flushPromises();
      scope.end();
      await flushPromises();
      expect(release).toHaveBeenCalledOnce();
    });

    it("releases a stale pending acquire without starting capture", async () => {
      const acquired = Promise.withResolvers<boolean>();
      const acquire = vi.fn().mockReturnValue(acquired.promise);
      const release = vi.fn().mockResolvedValue(true);
      const setScreenShareEnabled = vi.fn().mockResolvedValue(undefined);
      const connection = {
        state$: constant(ConnectionState.LivekitConnected),
        transport: mockTransportConfig,
        livekitRoom: mockLivekitRoom({
          localParticipant: mockLocalParticipant({
            isScreenShareEnabled: false,
            setScreenShareEnabled,
          }),
        }),
      } as unknown as Connection;
      const { scope, localMembership } = createMembershipWithConnection(
        connection,
        isolatedHost(acquire, release),
      );
      await flushPromises();
      localMembership.toggleScreenSharing!();
      localMembership.toggleScreenSharing!();
      acquired.resolve(true);
      await flushPromises();
      expect(setScreenShareEnabled).toHaveBeenCalledOnce();
      expect(setScreenShareEnabled).toHaveBeenCalledWith(
        false,
        expect.any(Object),
        undefined,
      );
      expect(release).toHaveBeenCalledOnce();
      scope.end();
    });

    it("releases when the publishing participant is replaced", async () => {
      const release = vi.fn().mockResolvedValue(true);
      const participant = mockLocalParticipant({
        isScreenShareEnabled: false,
        setScreenShareEnabled: vi.fn().mockResolvedValue(undefined),
        getTrackPublication: vi.fn((source) => publication(source)),
      });
      const replacement = mockLocalParticipant({ isScreenShareEnabled: false });
      const replacementConfig = {
        livekit_service_url: "b",
      } as LivekitTransportConfig;
      const replacementTransport = {
        ...mockTransport,
        transport: replacementConfig,
      } as LocalTransport;
      const connectionManagerData = new ConnectionManagerData();
      connectionManagerData.add(
        {
          state$: constant(ConnectionState.LivekitConnected),
          transport: mockTransportConfig,
          livekitRoom: mockLivekitRoom({ localParticipant: participant }),
        } as unknown as Connection,
        [],
      );
      connectionManagerData.add(
        {
          state$: constant(ConnectionState.LivekitConnected),
          transport: replacementConfig,
          livekitRoom: mockLivekitRoom({ localParticipant: replacement }),
        } as unknown as Connection,
        [],
      );
      const localTransport$ = new BehaviorSubject(mockTransport);
      const scope = new ObservableScope();
      const localMembership = createLocalMembership$({
        scope,
        ...defaultCreateLocalMemberValues,
        hostBridge: isolatedHost(undefined, release),
        connectionManager: {
          connectionManagerData$: constant(new Epoch(connectionManagerData)),
        },
        localTransport$,
      });
      await flushPromises();
      localMembership.toggleScreenSharing!();
      await flushPromises();

      localTransport$.next(replacementTransport);
      await flushPromises();
      expect(release).toHaveBeenCalledOnce();
      scope.end();
    });

    it("starts an isolated successor after a rapid off and on", async () => {
      let participant: LocalParticipant;
      const setScreenShareEnabled = vi.fn(async (enabled: boolean) => {
        Object.defineProperty(participant, "isScreenShareEnabled", {
          configurable: true,
          value: enabled,
        });
        if (!enabled) {
          participant.emit(
            ParticipantEvent.LocalTrackUnpublished,
            publication(Track.Source.ScreenShare),
          );
        }
        return await Promise.resolve(undefined);
      });
      participant = mockLocalParticipant({
        isScreenShareEnabled: false,
        setScreenShareEnabled,
        getTrackPublication: vi.fn((source) => publication(source)),
      });
      const acquire = vi.fn().mockResolvedValue(true);
      const release = vi.fn().mockResolvedValue(true);
      const connection = {
        state$: constant(ConnectionState.LivekitConnected),
        transport: mockTransportConfig,
        livekitRoom: mockLivekitRoom({ localParticipant: participant }),
      } as unknown as Connection;
      const { scope, localMembership } = createMembershipWithConnection(
        connection,
        isolatedHost(acquire, release),
      );
      await flushPromises();
      localMembership.toggleScreenSharing!();
      await flushPromises();

      localMembership.toggleScreenSharing!();
      localMembership.toggleScreenSharing!();
      await flushPromises();
      expect(
        setScreenShareEnabled.mock.calls.map(([enabled]) => enabled),
      ).toEqual([true, false, true]);
      expect(acquire).toHaveBeenCalledTimes(2);
      expect(release).toHaveBeenCalledOnce();
      scope.end();
    });

    it("surfaces a failure and clears it on dismiss", async () => {
      const error = new Error("NotReadableError");
      const setScreenShareEnabled = vi.fn().mockRejectedValue(error);
      const connection = {
        state$: constant(ConnectionState.LivekitConnected),
        transport: mockTransportConfig,
        livekitRoom: mockLivekitRoom({
          localParticipant: mockLocalParticipant({
            isScreenShareEnabled: false,
            setScreenShareEnabled,
          }),
        }),
      } as unknown as Connection;
      const { scope, localMembership } =
        createMembershipWithConnection(connection);
      await flushPromises();

      expect(localMembership.toggleScreenSharing).not.toBeNull();
      expect(localMembership.screenShareError$.value).toBeNull();

      localMembership.toggleScreenSharing!();
      await flushPromises();

      expect(setScreenShareEnabled).toHaveBeenCalledWith(
        true,
        expect.any(Object),
        undefined,
      );
      expect(localMembership.screenShareError$.value).toBe(error);

      localMembership.dismissScreenShareError();
      expect(localMembership.screenShareError$.value).toBeNull();

      scope.end();
    });

    it("does nothing when there is no local participant", async () => {
      // No connection means participant$ never resolves to a participant.
      const { scope, localMembership } = createMembershipWithConnection(null);
      await flushPromises();

      expect(localMembership.toggleScreenSharing).not.toBeNull();
      localMembership.toggleScreenSharing!();
      await flushPromises();

      expect(localMembership.screenShareError$.value).toBeNull();

      scope.end();
    });
  });
});

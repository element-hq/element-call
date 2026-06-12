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
} from "vitest";
import { AutoDiscovery } from "matrix-js-sdk/lib/autodiscovery";
import { BehaviorSubject, map, of } from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";
import { type LocalParticipant, type LocalTrack } from "livekit-client";

import { PosthogAnalytics } from "../../../analytics/PosthogAnalytics";
import { MatrixRTCMode } from "../../../config/ConfigOptions";
import { type HomeserverDisconnectReason } from "./HomeserverConnected";
import {
  flushPromises,
  mockConfig,
  mockLivekitRoom,
  mockMuteStates,
  withTestScheduler,
  ownMemberMock,
} from "../../../utils/test";
import {
  TransportState,
  createLocalMembership$,
  enterRTCSession,
  PublishState,
  TrackState,
} from "./LocalMember";
import {
  FailToGetOpenIdToken,
  MatrixRTCTransportMissingError,
} from "../../../utils/errors";
import { Epoch, ObservableScope } from "../../ObservableScope";
import { constant } from "../../Behavior";
import { ConnectionManagerData } from "../remoteMembers/ConnectionManager";
import { ConnectionState, type Connection } from "../remoteMembers/Connection";
import { type Publisher } from "./Publisher";
import { initializeWidget } from "../../../widget";
import {
  type LocalTransport,
  type LocalTransportWithSFUConfig,
} from "./LocalTransport";

initializeWidget();

const MATRIX_RTC_MODE = MatrixRTCMode.Legacy;
const getUrlParams = vi.hoisted(() => vi.fn(() => ({})));
vi.mock("../../../UrlParams", () => ({ getUrlParams }));
vi.mock("@livekit/components-core", () => ({
  observeParticipantEvents: vi
    .fn()
    .mockReturnValue(of({ isScreenShareEnabled: false })),
}));

describe("LocalMembership", () => {
  describe("enterRTCSession", () => {
    it("It joins the correct Session", () => {
      const focusFromOlderMembership = {
        type: "livekit",
        livekit_service_url: "http://my-oldest-member-service-url.com",
        livekit_alias: "my-oldest-member-service-alias",
      };

      const focusConfigFromWellKnown = {
        type: "livekit",
        livekit_service_url: "http://my-well-known-service-url.com",
      };
      const focusConfigFromWellKnown2 = {
        type: "livekit",
        livekit_service_url: "http://my-well-known-service-url2.com",
      };
      const clientWellKnown = {
        "org.matrix.msc4143.rtc_foci": [
          focusConfigFromWellKnown,
          focusConfigFromWellKnown2,
        ],
      };

      mockConfig({
        livekit: { livekit_service_url: "http://my-default-service-url.com" },
      });

      vi.spyOn(AutoDiscovery, "getRawClientConfig").mockImplementation(
        async (domain) => {
          if (domain === "example.org") {
            return Promise.resolve(clientWellKnown);
          }
          return Promise.resolve({});
        },
      );

      const mockedSession = vi.mocked({
        room: {
          roomId: "roomId",
          client: {
            getDomain: vi.fn().mockReturnValue("example.org"),
            getOpenIdToken: vi.fn().mockResolvedValue({
              access_token: "ACCCESS_TOKEN",
              token_type: "Bearer",
              matrix_server_name: "localhost",
              expires_in: 10000,
            }),
          },
        },
        memberships: [],
        getFocusInUse: vi.fn().mockReturnValue(focusFromOlderMembership),
        getOldestMembership: vi.fn().mockReturnValue({
          getPreferredFoci: vi.fn().mockReturnValue([focusFromOlderMembership]),
        }),
        joinRTCSession: vi.fn(),
      }) as unknown as MatrixRTCSession;

      enterRTCSession(
        mockedSession,
        ownMemberMock,
        {
          livekit_alias: "roomId",
          livekit_service_url: "http://my-well-known-service-url.com",
          type: "livekit",
        },
        {
          encryptMedia: true,
          matrixRTCMode: MATRIX_RTC_MODE,
        },
      );

      expect(mockedSession.joinRTCSession).toHaveBeenLastCalledWith(
        {
          deviceId: "DEVICE",
          memberId: "@alice:example.org:DEVICE",
          userId: "@alice:example.org",
        },
        [
          {
            livekit_alias: "roomId",
            livekit_service_url: "http://my-well-known-service-url.com",
            type: "livekit",
          },
        ],
        undefined,
        expect.objectContaining({
          manageMediaKeys: true,
          useLegacyMemberEvents: false,
        }),
      );
    });

    it("It should not fail with configuration error if homeserver config has livekit url but not fallback", () => {
      mockConfig({});
      vi.spyOn(AutoDiscovery, "getRawClientConfig").mockResolvedValue({
        "org.matrix.msc4143.rtc_foci": [
          {
            type: "livekit",
            livekit_service_url: "http://my-well-known-service-url.com",
          },
        ],
      });

      const mockedSession = vi.mocked({
        room: {
          roomId: "roomId",
          client: {
            getDomain: vi.fn().mockReturnValue("example.org"),
            getOpenIdToken: vi.fn().mockResolvedValue({
              access_token: "ACCCESS_TOKEN",
              token_type: "Bearer",
              matrix_server_name: "localhost",
              expires_in: 10000,
            }),
          },
        },
        memberships: [],
        getFocusInUse: vi.fn(),
        joinRTCSession: vi.fn(),
      }) as unknown as MatrixRTCSession;

      enterRTCSession(
        mockedSession,
        ownMemberMock,
        {
          livekit_alias: "roomId",
          livekit_service_url: "http://my-well-known-service-url.com",
          type: "livekit",
        },
        {
          encryptMedia: true,
          matrixRTCMode: MATRIX_RTC_MODE,
        },
      );
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
  };

  it("throws error on missing RTC config error", () => {
    withTestScheduler(({ scope, hot, behavior, expectObservable }) => {
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

      const aLocalTransport: LocalTransport = {
        advertised$: localTransport$,
        active$: behavior("a", { a: null }),
      };

      const localMembership = createLocalMembership$({
        scope,
        ...defaultCreateLocalMemberValues,
        connectionManager: mockConnectionManager,
        localTransport$: behavior("a", { a: aLocalTransport }),
      });
      localMembership.requestJoinAndPublish();

      expectObservable(localMembership.localMemberState$).toBe("ne", {
        n: TransportState.Waiting,
        e: expect.toSatisfy((e) => e instanceof MatrixRTCTransportMissingError),
      });
    });
  });

  it("Should not publish to active transport if advertised has errors", () => {
    withTestScheduler(({ scope, hot, behavior, expectObservable }) => {
      const advertised$ = scope.behavior<null | LivekitTransportConfig>(
        hot("--#", {}, new FailToGetOpenIdToken(new Error("foo"))),
        null,
      );

      // Populate a connection for active
      const connectionManagerData = new ConnectionManagerData();
      connectionManagerData.add(connectionTransportBConnected, []);
      const mockConnectionManager = {
        transports$: constant(new Epoch([bTransport])),
        connectionManagerData$: constant(new Epoch(connectionManagerData)),
      };

      const aLocalTransport: LocalTransport = {
        advertised$,
        active$: behavior("a", { n: null, a: bTransportWithSFUConfig }),
      };

      defaultCreateLocalMemberValues.createPublisherFactory.mockImplementation(
        () => {
          return {} as unknown as Publisher;
        },
      );
      const publisherFactory =
        defaultCreateLocalMemberValues.createPublisherFactory as ReturnType<
          typeof vi.fn
        >;

      const localMembership = createLocalMembership$({
        scope,
        ...defaultCreateLocalMemberValues,
        connectionManager: mockConnectionManager,
        localTransport$: behavior("a", { a: aLocalTransport }),
      });
      localMembership.requestJoinAndPublish();

      expectObservable(localMembership.localMemberState$).toBe("n-e", {
        n: TransportState.Waiting,
        e: expect.toSatisfy((e) => e instanceof FailToGetOpenIdToken),
      });

      // Should not have created any publisher
      expect(publisherFactory).toHaveBeenCalledTimes(0);
    });
  });

  it("logs if callIntent cannot be updated", async () => {
    const scope = new ObservableScope();

    const aLocalTransport: LocalTransport = {
      advertised$: new BehaviorSubject(aTransport),
      active$: new BehaviorSubject(aTransportWithSFUConfig),
    };

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
      localTransport$: new BehaviorSubject(aLocalTransport),
    });
    const expextedLog =
      "'not connected yet' while updating the call intent (this is expected on startup)";
    const internalLogger = vi.spyOn(localMembership.internalLoggerRef, "debug");

    await flushPromises();
    defaultCreateLocalMemberValues.muteStates.video.setEnabled$.value?.(true);
    expect(internalLogger).toHaveBeenCalledWith(expextedLog);
    scope.end();
  });

  const aTransport = {
    livekit_service_url: "a",
  } as LivekitTransportConfig;

  const aTransportWithSFUConfig = {
    transport: aTransport,
    sfuConfig: {
      jwt: "foo",
      livekitAlias: "bar",
      livekitIdentity: "baz",
      url: "bro",
    },
  } as LocalTransportWithSFUConfig;

  const bTransport = {
    livekit_service_url: "b",
  } as LivekitTransportConfig;

  const bTransportWithSFUConfig = {
    transport: bTransport,
    sfuConfig: {
      jwt: "foo2",
      livekitAlias: "bar2",
      livekitIdentity: "baz2",
      url: "bro2",
    },
  } as LocalTransportWithSFUConfig;

  const connectionTransportAConnected = {
    livekitRoom: mockLivekitRoom({
      localParticipant: {
        isScreenShareEnabled: false,
        trackPublications: [],
      } as unknown as LocalParticipant,
    }),
    state$: constant(ConnectionState.LivekitConnected),
    transport: aTransport,
  } as unknown as Connection;
  const connectionTransportAConnecting = {
    ...connectionTransportAConnected,
    state$: constant(ConnectionState.LivekitConnecting),
    livekitRoom: mockLivekitRoom({}),
  } as unknown as Connection;
  const connectionTransportBConnected = {
    state$: constant(ConnectionState.LivekitConnected),
    transport: bTransport,
    livekitRoom: mockLivekitRoom({}),
  } as unknown as Connection;

  it("recreates publisher if new connection is used, always unpublish and end tracks", async () => {
    const scope = new ObservableScope();

    const activeTransport$ = new BehaviorSubject(aTransportWithSFUConfig);
    const aLocalTransport: LocalTransport = {
      advertised$: new BehaviorSubject(aTransport),
      active$: activeTransport$,
    };

    const publishers: Publisher[] = [];
    let seed = 0;
    defaultCreateLocalMemberValues.createPublisherFactory.mockImplementation(
      () => {
        const a = seed;
        seed += 1;
        logger.info(`creating [${a}]`);
        const p = {
          // It is enought to check if destroy is called. Destroy itself is tested in the publisher to make sure it does
          // all the cleanup we need.
          destroy: vi.fn(),
          stopPublishing: vi.fn().mockImplementation(() => {
            logger.info(`stopPublishing [${a}]`);
          }),
          stopTracks: vi.fn(),
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
    connectionManagerData.add(connectionTransportBConnected, []);
    createLocalMembership$({
      scope,
      ...defaultCreateLocalMemberValues,
      connectionManager: {
        connectionManagerData$: constant(new Epoch(connectionManagerData)),
      },
      localTransport$: new BehaviorSubject(aLocalTransport),
    });
    await flushPromises();
    activeTransport$.next({
      ...aTransportWithSFUConfig,
      transport: bTransport,
    });
    await flushPromises();

    expect(publisherFactory).toHaveBeenCalledTimes(2);
    expect(publishers.length).toBe(2);
    // stop the first Publisher and let the second one life.
    expect(publishers[0].destroy).toHaveBeenCalled();
    expect(publishers[1].destroy).not.toHaveBeenCalled();
    expect(publisherFactory.mock.calls[0][0].transport).toBe(aTransport);
    expect(publisherFactory.mock.calls[1][0].transport).toBe(bTransport);
    scope.end();
    await flushPromises();
    // stop all tracks after ending scopes
    expect(publishers[1].destroy).toHaveBeenCalled();
    // expect(publishers[1].stopTracks).toHaveBeenCalled();

    defaultCreateLocalMemberValues.createPublisherFactory.mockReset();
  });

  it("only start tracks if requested", async () => {
    const scope = new ObservableScope();

    const publishers: Publisher[] = [];

    const tracks$ = new BehaviorSubject<LocalTrack[]>([]);
    const publishing$ = new BehaviorSubject<boolean>(false);
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

    const aLocalTransport: LocalTransport = {
      advertised$: new BehaviorSubject(aTransport),
      active$: new BehaviorSubject(aTransportWithSFUConfig),
    };

    const connectionManagerData = new ConnectionManagerData();
    connectionManagerData.add(connectionTransportAConnected, []);
    // connectionManagerData.add(connectionTransportB, []);
    const localMembership = createLocalMembership$({
      scope,
      ...defaultCreateLocalMemberValues,
      connectionManager: {
        connectionManagerData$: constant(new Epoch(connectionManagerData)),
      },
      localTransport$: new BehaviorSubject(aLocalTransport),
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

    const activeTransport$ =
      new BehaviorSubject<null | LocalTransportWithSFUConfig>(null);

    const aLocalTransport: LocalTransport = {
      advertised$: new BehaviorSubject(aTransport),
      active$: activeTransport$,
    };

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
      localTransport$: new BehaviorSubject(aLocalTransport),
    });

    await flushPromises();
    expect(localMembership.localMemberState$.value).toStrictEqual(
      TransportState.Waiting,
    );
    activeTransport$.next(aTransportWithSFUConfig);
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
      connectionManagerData2.getConnectionForTransport(aTransport)!
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
        localTransport$: new BehaviorSubject({
          advertised$: new BehaviorSubject(aTransport),
          active$: new BehaviorSubject(aTransportWithSFUConfig),
        }),
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
        localTransport$: new BehaviorSubject({
          advertised$: new BehaviorSubject(aTransport),
          active$: new BehaviorSubject(aTransportWithSFUConfig),
        }),
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
          combined$: new BehaviorSubject<
            [boolean, HomeserverDisconnectReason | null]
          >([true, null]),
          rtsSession$: constant(RTCMemberStatus.Connected),
        },
        connectionManager: {
          connectionManagerData$: constant(new Epoch(connectionManagerData)),
        },
        localTransport$: new BehaviorSubject({
          advertised$: new BehaviorSubject(aTransport),
          active$: new BehaviorSubject(aTransportWithSFUConfig),
        }),
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
        localTransport$: new BehaviorSubject({
          advertised$: new BehaviorSubject(aTransport),
          active$: new BehaviorSubject(aTransportWithSFUConfig),
        }),
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
});

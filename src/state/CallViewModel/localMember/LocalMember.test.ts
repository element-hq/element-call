/*
Copyright 2025 Element Creations Ltd.
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  Status as RTCMemberStatus,
  type LivekitTransport,
  type MatrixRTCSession,
} from "matrix-js-sdk/lib/matrixrtc";
import { describe, expect, it, vi } from "vitest";
import { AutoDiscovery } from "matrix-js-sdk/lib/autodiscovery";
import { BehaviorSubject, map, of } from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";
import { type LocalParticipant, type LocalTrack } from "livekit-client";

import { MatrixRTCMode } from "../../../settings/settings";
import {
  flushPromises,
  mockConfig,
  mockLivekitRoom,
  mockMuteStates,
  withTestScheduler,
} from "../../../utils/test";
import {
  TransportState,
  createLocalMembership$,
  enterRTCSession,
  PublishState,
  TrackState,
} from "./LocalMember";
import { MatrixRTCTransportMissingError } from "../../../utils/errors";
import { Epoch, ObservableScope } from "../../ObservableScope";
import { constant } from "../../Behavior";
import { ConnectionManagerData } from "../remoteMembers/ConnectionManager";
import { ConnectionState, type Connection } from "../remoteMembers/Connection";
import { type Publisher } from "./Publisher";

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
        joinRoomSession: vi.fn(),
      }) as unknown as MatrixRTCSession;

      enterRTCSession(
        mockedSession,
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

      expect(mockedSession.joinRoomSession).toHaveBeenLastCalledWith(
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
        joinRoomSession: vi.fn(),
      }) as unknown as MatrixRTCSession;

      enterRTCSession(
        mockedSession,
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
      updateCallIntent: () => {},
      leaveRoomSession: () => {},
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
      combined$: constant(true),
      rtsSession$: constant(RTCMemberStatus.Connected),
    },
  };

  it("throws error on missing RTC config error", () => {
    withTestScheduler(({ scope, hot, expectObservable }) => {
      const localTransport$ = scope.behavior<null | LivekitTransport>(
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
        localTransport$,
      });
      localMembership.requestJoinAndPublish();

      expectObservable(localMembership.localMemberState$).toBe("ne", {
        n: TransportState.Waiting,
        e: expect.toSatisfy((e) => e instanceof MatrixRTCTransportMissingError),
      });
    });
  });

  const aTransport = {
    livekit_service_url: "a",
  } as LivekitTransport;
  const bTransport = {
    livekit_service_url: "b",
  } as LivekitTransport;

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
  } as unknown as Connection;
  const connectionTransportBConnected = {
    state$: constant(ConnectionState.LivekitConnected),
    transport: bTransport,
  } as unknown as Connection;

  it("recreates publisher if new connection is used and ENDS always unpublish and end tracks", async () => {
    const scope = new ObservableScope();

    const localTransport$ = new BehaviorSubject(aTransport);

    const publishers: Publisher[] = [];

    defaultCreateLocalMemberValues.createPublisherFactory.mockImplementation(
      () => {
        const p = {
          stopPublishing: vi.fn(),
          stopTracks: vi.fn(),
          publishing$: constant(false),
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
      localTransport$,
    });
    await flushPromises();
    localTransport$.next(bTransport);
    await flushPromises();
    expect(publisherFactory).toHaveBeenCalledTimes(2);
    expect(publishers.length).toBe(2);
    // stop the first Publisher and let the second one life.
    expect(publishers[0].stopTracks).toHaveBeenCalled();
    expect(publishers[1].stopTracks).not.toHaveBeenCalled();
    expect(publishers[0].stopPublishing).toHaveBeenCalled();
    expect(publishers[1].stopPublishing).not.toHaveBeenCalled();
    expect(publisherFactory.mock.calls[0][0].transport).toBe(aTransport);
    expect(publisherFactory.mock.calls[1][0].transport).toBe(bTransport);
    scope.end();
    await flushPromises();
    // stop all tracks after ending scopes
    expect(publishers[1].stopPublishing).toHaveBeenCalled();
    expect(publishers[1].stopTracks).toHaveBeenCalled();

    defaultCreateLocalMemberValues.createPublisherFactory.mockReset();
  });

  it("only start tracks if requested", async () => {
    const scope = new ObservableScope();

    const localTransport$ = new BehaviorSubject(aTransport);

    const publishers: Publisher[] = [];

    const tracks$ = new BehaviorSubject<LocalTrack[]>([]);
    const publishing$ = new BehaviorSubject<boolean>(false);
    defaultCreateLocalMemberValues.createPublisherFactory.mockImplementation(
      () => {
        const p = {
          stopPublishing: vi.fn(),
          stopTracks: vi.fn(),
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
      localTransport$,
    });
    await flushPromises();
    expect(publisherFactory).toHaveBeenCalledOnce();
    expect(localMembership.tracks$.value.length).toBe(0);
    localMembership.startTracks();
    await flushPromises();
    expect(localMembership.tracks$.value.length).toBe(2);
    scope.end();
    await flushPromises();
    // stop all tracks after ending scopes
    expect(publishers[0].stopPublishing).toHaveBeenCalled();
    expect(publishers[0].stopTracks).toHaveBeenCalled();
    publisherFactory.mockClear();
  });
  // TODO add an integration test combining publisher and localMembership
  //
  it("tracks livekit state correctly", async () => {
    const scope = new ObservableScope();

    const connectionManagerData = new ConnectionManagerData();
    const localTransport$ = new BehaviorSubject<null | LivekitTransport>(null);
    const connectionManagerData$ = new BehaviorSubject(
      new Epoch(connectionManagerData),
    );
    const publishers: Publisher[] = [];

    const tracks$ = new BehaviorSubject<LocalTrack[]>([]);
    const publishing$ = new BehaviorSubject<boolean>(false);
    const createTrackResolver = Promise.withResolvers<void>();
    const publishResolver = Promise.withResolvers<void>();
    defaultCreateLocalMemberValues.createPublisherFactory.mockImplementation(
      () => {
        const p = {
          stopPublishing: vi.fn(),
          stopTracks: vi.fn().mockImplementation(() => {
            logger.info("stopTracks");
            tracks$.next([]);
          }),
          createAndSetupTracks: vi.fn().mockImplementation(async () => {
            await createTrackResolver.promise;
            tracks$.next([{}, {}] as LocalTrack[]);
          }),
          startPublishing: vi.fn().mockImplementation(async () => {
            await publishResolver.promise;
            publishing$.next(true);
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
    localTransport$.next(aTransport);
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
    expect(localMembership.tracks$.value.length).toBe(0);

    // -------
    localMembership.startTracks();
    // -------

    await flushPromises();
    expect(localMembership.localMemberState$.value).toStrictEqual({
      matrix: RTCMemberStatus.Connected,
      media: {
        tracks: TrackState.Creating,
        connection: ConnectionState.LivekitConnected,
      },
    });
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
    ).toStrictEqual(PublishState.Starting);

    publishResolver.resolve();
    await flushPromises();
    expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (localMembership.localMemberState$.value as any).media,
    ).toStrictEqual(PublishState.Publishing);

    expect(publishers[0].stopPublishing).not.toHaveBeenCalled();

    expect(localMembership.localMemberState$.isStopped).toBe(false);
    scope.end();
    await flushPromises();
    // stays in connected state because it is stopped before the update to tracks update the state.
    expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (localMembership.localMemberState$.value as any).media,
    ).toStrictEqual(PublishState.Publishing);
    // stop all tracks after ending scopes
    expect(publishers[0].stopPublishing).toHaveBeenCalled();
    expect(publishers[0].stopTracks).toHaveBeenCalled();
  });
  // TODO add tests for matrix local matrix participation.
});

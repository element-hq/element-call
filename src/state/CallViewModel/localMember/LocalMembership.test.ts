/*
Copyright 2025 Element Creations Ltd.
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type LivekitTransport,
  type MatrixRTCSession,
} from "matrix-js-sdk/lib/matrixrtc";
import { describe, expect, it, vi } from "vitest";
import { AutoDiscovery } from "matrix-js-sdk/lib/autodiscovery";
import { BehaviorSubject, map, of } from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";
import { type LocalParticipant } from "livekit-client";

import { MatrixRTCMode } from "../../../settings/settings";
import {
  flushPromises,
  mockConfig,
  mockLivekitRoom,
  mockMuteStates,
  withTestScheduler,
} from "../../../utils/test";
import {
  createLocalMembership$,
  enterRTCSession,
  LivekitState,
} from "./LocalMembership";
import { MatrixRTCTransportMissingError } from "../../../utils/errors";
import { Epoch, ObservableScope } from "../../ObservableScope";
import { constant } from "../../Behavior";
import { ConnectionManagerData } from "../remoteMembers/ConnectionManager";
import { type Connection } from "../remoteMembers/Connection";

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
    it("It joins the correct Session", async () => {
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

      await enterRTCSession(
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

    it("It should not fail with configuration error if homeserver config has livekit url but not fallback", async () => {
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

      await enterRTCSession(
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
    isHomeserverConnected: constant(true),
    trackProcessorState$: constant({
      supported: false,
      processor: undefined,
    }),
    logger: logger,
    createPublisherFactory: vi.fn(),
    joinMatrixRTC: async (): Promise<void> => {},
    homeserverConnected$: constant(true),
  };

  it("throws error on missing RTC config error", () => {
    withTestScheduler(({ scope, hot, expectObservable }) => {
      const goodTransport = {
        livekit_service_url: "other",
      } as LivekitTransport;

      const localTransport$ = scope.behavior<LivekitTransport>(
        hot("1ms #", {}, new MatrixRTCTransportMissingError("domain.com")),
        goodTransport,
      );

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

      expectObservable(localMembership.connectionState.livekit$).toBe("ne", {
        n: { state: LivekitState.Connecting },
        e: {
          state: LivekitState.Error,
          error: expect.toSatisfy(
            (e) => e instanceof MatrixRTCTransportMissingError,
          ),
        },
      });
    });
  });

  it("recreates publisher if new connection is used", async () => {
    const scope = new ObservableScope();
    const aTransport = {
      livekit_service_url: "a",
    } as LivekitTransport;
    const bTransport = {
      livekit_service_url: "b",
    } as LivekitTransport;

    const localTransport$ = new BehaviorSubject(aTransport);

    const connectionManagerData = new ConnectionManagerData();

    connectionManagerData.add(
      {
        livekitRoom: mockLivekitRoom({
          localParticipant: {
            isScreenShareEnabled: false,
            trackPublications: [],
          } as unknown as LocalParticipant,
        }),
        state$: constant({
          state: "ConnectedToLkRoom",
        }),
        transport: aTransport,
      } as unknown as Connection,
      [],
    );
    connectionManagerData.add(
      {
        state$: constant({
          state: "ConnectedToLkRoom",
        }),
        transport: bTransport,
      } as unknown as Connection,
      [],
    );

    const publisherFactory =
      defaultCreateLocalMemberValues.createPublisherFactory as ReturnType<
        typeof vi.fn
      >;

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
    expect(publisherFactory.mock.calls[0][0].transport).toBe(aTransport);
    expect(publisherFactory.mock.calls[1][0].transport).toBe(bTransport);
  });
});

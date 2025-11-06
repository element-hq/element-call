/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, test, vi, expect, beforeEach, afterEach } from "vitest";
import { BehaviorSubject } from "rxjs";
import {
  type CallMembership,
  type LivekitTransport,
} from "matrix-js-sdk/lib/matrixrtc";
import { type Room as MatrixRoom, type RoomMember } from "matrix-js-sdk";
import { getParticipantId } from "matrix-js-sdk/lib/matrixrtc/utils";

import { type ConnectionManagerReturn } from "./ConnectionManager.ts";
import {
  type MatrixLivekitMember,
  createMatrixLivekitMembers$,
  areLivekitTransportsEqual,
} from "./MatrixLivekitMembers";
import { ObservableScope } from "../ObservableScope";
import { ConnectionManagerData } from "./ConnectionManager";
import {
  mockCallMembership,
  mockRemoteParticipant,
  type OurRunHelpers,
  withTestScheduler,
} from "../../utils/test.ts";
import { type Connection } from "./Connection.ts";

let testScope: ObservableScope;
let mockMatrixRoom: MatrixRoom;
const userId = "@local:example.com";
const deviceId = "DEVICE000";

// The merger beeing tested

beforeEach(() => {
  testScope = new ObservableScope();
  mockMatrixRoom = vi.mocked<MatrixRoom>({
    getMember: vi.fn().mockImplementation((userId: string) => {
      return {
        userId,
        rawDisplayName: userId.replace("@", "").replace(":example.org", ""),
        getMxcAvatarUrl: vi.fn().mockReturnValue(null),
      } as unknown as RoomMember;
    }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MatrixRoom);
});

afterEach(() => {
  testScope.end();
});

test("should signal participant not yet connected to livekit", () => {
  withTestScheduler(({ behavior, expectObservable }) => {
    const bobMembership = {
      userId: "@bob:example.org",
      deviceId: "DEV000",
      transports: [
        {
          type: "livekit",
          livekit_service_url: "https://lk.example.org",
          livekit_alias: "!alias:example.org",
        },
      ],
    } as unknown as CallMembership;

    const matrixLivekitMember$ = createMatrixLivekitMembers$({
      scope: testScope,
      membershipsWithTransport$: behavior("a", {
        a: [
          {
            membership: bobMembership,
          },
        ],
      }),
      connectionManager: {
        connectionManagerData$: behavior("a", {
          a: new ConnectionManagerData(),
        }),
        transports$: behavior("a", { a: [] }),
        connections$: behavior("a", { a: [] }),
      },
      matrixRoom: mockMatrixRoom,
      userId,
      deviceId,
    });

    expectObservable(matrixLivekitMember$).toBe("a", {
      a: expect.toSatisfy((data: MatrixLivekitMember[]) => {
        return (
          data.length == 1 &&
          data[0].membership === bobMembership &&
          data[0].participant === undefined &&
          data[0].connection === undefined
        );
      }),
    });
  });
});

function aConnectionManager(
  data: ConnectionManagerData,
  behavior: Pick<OurRunHelpers, "behavior">,
): ConnectionManagerReturn {
  return {
    connectionManagerData$: behavior("a", { a: data }),
    transports$: behavior("a", {
      a: [data.getConnections().map((connection) => connection.transport)],
    }),
    connections$: behavior("a", { a: [data.getConnections()] }),
  };
}

test("should signal participant on a connection that is publishing", () => {
  withTestScheduler(({ behavior, expectObservable }) => {
    const transport: LivekitTransport = {
      type: "livekit",
      livekit_service_url: "https://lk.example.org",
      livekit_alias: "!alias:example.org",
    };

    const bobMembership = mockCallMembership(
      "@bob:example.org",
      "DEV000",
      transport,
    );

    const connectionWithPublisher = new ConnectionManagerData();
    const bobParticipantId = getParticipantId(
      bobMembership.userId,
      bobMembership.deviceId,
    );
    const connection = {
      transport: transport,
    } as unknown as Connection;
    connectionWithPublisher.add(connection, [
      mockRemoteParticipant({ identity: bobParticipantId }),
    ]);
    const matrixLivekitMember$ = createMatrixLivekitMembers$({
      scope: testScope,
      membershipsWithTransport$: behavior("a", {
        a: [
          {
            membership: bobMembership,
            transport,
          },
        ],
      }),
      connectionManager: aConnectionManager(connectionWithPublisher, behavior),
      matrixRoom: mockMatrixRoom,
      userId,
      deviceId,
    });

    expectObservable(matrixLivekitMember$).toBe("a", {
      a: expect.toSatisfy((data: MatrixLivekitMember[]) => {
        expect(data.length).toEqual(1);
        expect(data[0].participant).toBeDefined();
        expect(data[0].connection).toBeDefined();
        expect(data[0].membership).toEqual(bobMembership);
        expect(
          areLivekitTransportsEqual(data[0].connection!.transport, transport),
        ).toBe(true);
        return true;
      }),
    });
  });
});

test("should signal participant on a connection that is not publishing", () => {
  withTestScheduler(({ behavior, expectObservable }) => {
    const transport: LivekitTransport = {
      type: "livekit",
      livekit_service_url: "https://lk.example.org",
      livekit_alias: "!alias:example.org",
    };

    const bobMembership = mockCallMembership(
      "@bob:example.org",
      "DEV000",
      transport,
    );

    const connectionWithPublisher = new ConnectionManagerData();
    // const bobParticipantId = getParticipantId(bobMembership.userId, bobMembership.deviceId);
    const connection = {
      transport: transport,
    } as unknown as Connection;
    connectionWithPublisher.add(connection, []);
    const matrixLivekitMember$ = createMatrixLivekitMembers$({
      scope: testScope,
      membershipsWithTransport$: behavior("a", {
        a: [
          {
            membership: bobMembership,
            transport,
          },
        ],
      }),
      connectionManager: aConnectionManager(connectionWithPublisher, behavior),
      matrixRoom: mockMatrixRoom,
      userId,
      deviceId,
    });

    expectObservable(matrixLivekitMember$).toBe("a", {
      a: expect.toSatisfy((data: MatrixLivekitMember[]) => {
        expect(data.length).toEqual(1);
        expect(data[0].participant).not.toBeDefined();
        expect(data[0].connection).toBeDefined();
        expect(data[0].membership).toEqual(bobMembership);
        expect(
          areLivekitTransportsEqual(data[0].connection!.transport, transport),
        ).toBe(true);
        return true;
      }),
    });
  });
});

describe("Publication edge case", () => {
  test("bob is publishing in several connections", () => {
    withTestScheduler(({ behavior, expectObservable }) => {
      const transportA: LivekitTransport = {
        type: "livekit",
        livekit_service_url: "https://lk.example.org",
        livekit_alias: "!alias:example.org",
      };

      const transportB: LivekitTransport = {
        type: "livekit",
        livekit_service_url: "https://lk.sample.com",
        livekit_alias: "!alias:sample.com",
      };

      const bobMembership = mockCallMembership(
        "@bob:example.org",
        "DEV000",
        transportA,
      );

      const connectionWithPublisher = new ConnectionManagerData();
      const bobParticipantId = getParticipantId(
        bobMembership.userId,
        bobMembership.deviceId,
      );
      const connectionA = {
        transport: transportA,
      } as unknown as Connection;
      const connectionB = {
        transport: transportB,
      } as unknown as Connection;

      connectionWithPublisher.add(connectionA, [
        mockRemoteParticipant({ identity: bobParticipantId }),
      ]);
      connectionWithPublisher.add(connectionB, [
        mockRemoteParticipant({ identity: bobParticipantId }),
      ]);
      const matrixLivekitMember$ = createMatrixLivekitMembers$({
        scope: testScope,
        membershipsWithTransport$: behavior("a", {
          a: [
            {
              membership: bobMembership,
              transport: transportA,
            },
          ],
        }),
        connectionManager: aConnectionManager(
          connectionWithPublisher,
          behavior,
        ),
        matrixRoom: mockMatrixRoom,
        userId,
        deviceId,
      });

      expectObservable(matrixLivekitMember$).toBe("a", {
        a: expect.toSatisfy((data: MatrixLivekitMember[]) => {
          expect(data.length).toEqual(1);
          expect(data[0].participant).toBeDefined();
          expect(data[0].participant!.identity).toEqual(bobParticipantId);
          expect(data[0].connection).toBeDefined();
          expect(data[0].membership).toEqual(bobMembership);
          expect(
            areLivekitTransportsEqual(
              data[0].connection!.transport,
              transportA,
            ),
          ).toBe(true);
          return true;
        }),
      });
    });
  });

  test("bob is publishing in the wrong connection", () => {
    withTestScheduler(({ behavior, expectObservable }) => {
      const transportA: LivekitTransport = {
        type: "livekit",
        livekit_service_url: "https://lk.example.org",
        livekit_alias: "!alias:example.org",
      };

      const transportB: LivekitTransport = {
        type: "livekit",
        livekit_service_url: "https://lk.sample.com",
        livekit_alias: "!alias:sample.com",
      };

      const bobMembership = mockCallMembership(
        "@bob:example.org",
        "DEV000",
        transportA,
      );

      const connectionWithPublisher = new ConnectionManagerData();
      const bobParticipantId = getParticipantId(
        bobMembership.userId,
        bobMembership.deviceId,
      );
      const connectionA = {
        transport: transportA,
      } as unknown as Connection;
      const connectionB = {
        transport: transportB,
      } as unknown as Connection;

      connectionWithPublisher.add(connectionA, []);
      connectionWithPublisher.add(connectionB, [
        mockRemoteParticipant({ identity: bobParticipantId }),
      ]);
      const matrixLivekitMember$ = createMatrixLivekitMembers$({
        scope: testScope,
        membershipsWithTransport$: behavior("a", {
          a: [
            {
              membership: bobMembership,
              transport: transportA,
            },
          ],
        }),
        connectionManager: aConnectionManager(
          connectionWithPublisher,
          behavior,
        ),
        matrixRoom: mockMatrixRoom,
        userId,
        deviceId,
      });

      expectObservable(matrixLivekitMember$).toBe("a", {
        a: expect.toSatisfy((data: MatrixLivekitMember[]) => {
          expect(data.length).toEqual(1);
          expect(data[0].participant).not.toBeDefined();
          expect(data[0].connection).toBeDefined();
          expect(data[0].membership).toEqual(bobMembership);
          expect(
            areLivekitTransportsEqual(
              data[0].connection!.transport,
              transportA,
            ),
          ).toBe(true);
          return true;
        }),
      });
    });

    // let lastMatrixLkItems: MatrixLivekitMember[] = [];
    // matrixLivekitMerger.matrixLivekitMember$.subscribe((items) => {
    //   lastMatrixLkItems = items;
    // });

    // vi.mocked(bobMembership).getTransport = vi
    //   .fn()
    //   .mockReturnValue(connectionA.transport);

    // fakeMemberships$.next([bobMembership]);

    // const lkMap = new ConnectionManagerData();
    // lkMap.add(connectionA, []);
    // lkMap.add(connectionB, [
    //   mockRemoteParticipant({ identity: bobParticipantId })
    // ]);

    // fakeManagerData$.next(lkMap);

    // const items = lastMatrixLkItems;
    // expect(items).toHaveLength(1);
    // const item = items[0];

    // // Assert the expected membership
    // expect(item.membership.userId).toEqual(bobMembership.userId);
    // expect(item.membership.deviceId).toEqual(bobMembership.deviceId);

    // expect(item.participant).not.toBeDefined();

    // // The transport info should come from the membership transports and not only from the publishing connection
    // expect(item.connection?.transport?.livekit_service_url).toEqual(
    //   bobMembership.transports[0]?.livekit_service_url
    // );
    // expect(item.connection?.transport?.livekit_alias).toEqual(
    //   bobMembership.transports[0]?.livekit_alias
    // );
  });
});

/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
  type CallMembership,
  type LivekitTransport,
} from "matrix-js-sdk/lib/matrixrtc";
import { getParticipantId } from "matrix-js-sdk/lib/matrixrtc/utils";
import { combineLatest, map, type Observable } from "rxjs";

import { type IConnectionManager } from "./ConnectionManager.ts";
import {
  type RemoteMatrixLivekitMember,
  createMatrixLivekitMembers$,
} from "./MatrixLivekitMembers.ts";
import {
  Epoch,
  mapEpoch,
  ObservableScope,
  trackEpoch,
} from "../../ObservableScope.ts";
import { ConnectionManagerData } from "./ConnectionManager.ts";
import {
  mockCallMembership,
  mockRemoteParticipant,
  withTestScheduler,
} from "../../../utils/test.ts";
import { type Connection } from "./Connection.ts";

let testScope: ObservableScope;

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
const carlMembership = mockCallMembership(
  "@carl:sample.com",
  "DEV111",
  transportB,
);

beforeEach(() => {
  testScope = new ObservableScope();
});

afterEach(() => {
  testScope.end();
});

function epochMeWith$<T, U>(
  source$: Observable<Epoch<U>>,
  me$: Observable<T>,
): Observable<Epoch<T>> {
  return combineLatest([source$, me$]).pipe(
    map(([ep, cd]) => {
      return new Epoch(cd, ep.epoch);
    }),
  );
}

test("should signal participant not yet connected to livekit", () => {
  withTestScheduler(({ behavior, expectObservable }) => {
    const { memberships$, membershipsWithTransport$ } = fromMemberships$(
      behavior("a", {
        a: [bobMembership],
      }),
    );

    const connectionManagerData$ = epochMeWith$(
      memberships$,
      behavior("a", {
        a: new ConnectionManagerData(),
      }),
    );

    const matrixLivekitMember$ = createMatrixLivekitMembers$({
      scope: testScope,
      membershipsWithTransport$: testScope.behavior(membershipsWithTransport$),
      connectionManager: {
        connectionManagerData$: connectionManagerData$,
      } as unknown as IConnectionManager,
    });

    expectObservable(matrixLivekitMember$.pipe(map((e) => e.value))).toBe("a", {
      a: expect.toSatisfy((data: RemoteMatrixLivekitMember[]) => {
        expect(data.length).toEqual(1);
        expectObservable(data[0].membership$).toBe("a", {
          a: bobMembership,
        });
        expectObservable(data[0].participant.value$).toBe("a", {
          a: null,
        });
        expectObservable(data[0].connection$).toBe("a", {
          a: null,
        });
        return true;
      }),
    });
  });
});

// Helper to create epoch'ed memberships$ and membershipsWithTransport$ from memberships observable.
function fromMemberships$(m$: Observable<CallMembership[]>): {
  memberships$: Observable<Epoch<CallMembership[]>>;
  membershipsWithTransport$: Observable<
    Epoch<{ membership: CallMembership; transport?: LivekitTransport }[]>
  >;
} {
  const memberships$ = m$.pipe(trackEpoch());
  const membershipsWithTransport$ = memberships$.pipe(
    mapEpoch((members) => {
      return members.map((m) => {
        const tr = m.getTransport(m);
        return {
          membership: m,
          transport:
            tr?.type === "livekit" ? (tr as LivekitTransport) : undefined,
        };
      });
    }),
  );
  return {
    memberships$,
    membershipsWithTransport$,
  };
}

test("should signal participant on a connection that is publishing", () => {
  withTestScheduler(({ behavior, expectObservable }) => {
    const bobParticipantId = getParticipantId(
      bobMembership.userId,
      bobMembership.deviceId,
    );

    const { memberships$, membershipsWithTransport$ } = fromMemberships$(
      behavior("a", {
        a: [bobMembership],
      }),
    );

    const connection = {
      transport: bobMembership.getTransport(bobMembership),
    } as unknown as Connection;
    const dataWithPublisher = new ConnectionManagerData();
    dataWithPublisher.add(connection, [
      mockRemoteParticipant({ identity: bobParticipantId }),
    ]);

    const connectionManagerData$ = epochMeWith$(
      memberships$,
      behavior("a", {
        a: dataWithPublisher,
      }),
    );

    const matrixLivekitMember$ = createMatrixLivekitMembers$({
      scope: testScope,
      membershipsWithTransport$: testScope.behavior(membershipsWithTransport$),
      connectionManager: {
        connectionManagerData$: connectionManagerData$,
      } as unknown as IConnectionManager,
    });

    expectObservable(matrixLivekitMember$.pipe(map((e) => e.value))).toBe("a", {
      a: expect.toSatisfy((data: RemoteMatrixLivekitMember[]) => {
        expect(data.length).toEqual(1);
        expectObservable(data[0].membership$).toBe("a", {
          a: bobMembership,
        });
        expectObservable(data[0].participant.value$).toBe("a", {
          a: expect.toSatisfy((participant) => {
            expect(participant).toBeDefined();
            expect(participant!.identity).toEqual(bobParticipantId);
            return true;
          }),
        });
        expectObservable(data[0].connection$).toBe("a", {
          a: connection,
        });
        return true;
      }),
    });
  });
});

test("should signal participant on a connection that is not publishing", () => {
  withTestScheduler(({ behavior, expectObservable }) => {
    const { memberships$, membershipsWithTransport$ } = fromMemberships$(
      behavior("a", {
        a: [bobMembership],
      }),
    );

    const connection = {
      transport: bobMembership.getTransport(bobMembership),
    } as unknown as Connection;
    const dataWithPublisher = new ConnectionManagerData();
    dataWithPublisher.add(connection, []);

    const connectionManagerData$ = epochMeWith$(
      memberships$,
      behavior("a", {
        a: dataWithPublisher,
      }),
    );

    const matrixLivekitMember$ = createMatrixLivekitMembers$({
      scope: testScope,
      membershipsWithTransport$: testScope.behavior(membershipsWithTransport$),
      connectionManager: {
        connectionManagerData$: connectionManagerData$,
      } as unknown as IConnectionManager,
    });

    expectObservable(matrixLivekitMember$.pipe(map((e) => e.value))).toBe("a", {
      a: expect.toSatisfy((data: RemoteMatrixLivekitMember[]) => {
        expect(data.length).toEqual(1);
        expectObservable(data[0].membership$).toBe("a", {
          a: bobMembership,
        });
        expectObservable(data[0].participant.value$).toBe("a", {
          a: null,
        });
        expectObservable(data[0].connection$).toBe("a", {
          a: connection,
        });
        return true;
      }),
    });
  });
});

describe("Publication edge case", () => {
  test("bob is publishing in several connections", () => {
    withTestScheduler(({ behavior, expectObservable }) => {
      const { memberships$, membershipsWithTransport$ } = fromMemberships$(
        behavior("a", {
          a: [bobMembership, carlMembership],
        }),
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

      const connectionManagerData$ = epochMeWith$(
        memberships$,
        behavior("a", {
          a: connectionWithPublisher,
        }),
      );

      const matrixLivekitMember$ = createMatrixLivekitMembers$({
        scope: testScope,
        membershipsWithTransport$: testScope.behavior(
          membershipsWithTransport$,
        ),
        connectionManager: {
          connectionManagerData$: connectionManagerData$,
        } as unknown as IConnectionManager,
      });

      expectObservable(matrixLivekitMember$.pipe(map((e) => e.value))).toBe(
        "a",
        {
          a: expect.toSatisfy((data: RemoteMatrixLivekitMember[]) => {
            expect(data.length).toEqual(2);
            expectObservable(data[0].membership$).toBe("a", {
              a: bobMembership,
            });
            expectObservable(data[0].connection$).toBe("a", {
              // The real connection should be from transportA as per the membership
              a: connectionA,
            });
            expectObservable(data[0].participant.value$).toBe("a", {
              a: expect.toSatisfy((participant) => {
                expect(participant).toBeDefined();
                expect(participant!.identity).toEqual(bobParticipantId);
                return true;
              }),
            });
            return true;
          }),
        },
      );
    });
  });

  test("bob is publishing in the wrong connection", () => {
    withTestScheduler(({ behavior, expectObservable }) => {
      const { memberships$, membershipsWithTransport$ } = fromMemberships$(
        behavior("a", {
          a: [bobMembership, carlMembership],
        }),
      );

      const connectionWithPublisher = new ConnectionManagerData();
      const bobParticipantId = getParticipantId(
        bobMembership.userId,
        bobMembership.deviceId,
      );
      const connectionA = { transport: transportA } as unknown as Connection;
      const connectionB = { transport: transportB } as unknown as Connection;

      // Bob is not publishing on A
      connectionWithPublisher.add(connectionA, []);
      // Bob is publishing on B but his membership says A
      connectionWithPublisher.add(connectionB, [
        mockRemoteParticipant({ identity: bobParticipantId }),
      ]);

      const connectionManagerData$ = epochMeWith$(
        memberships$,
        behavior("a", {
          a: connectionWithPublisher,
        }),
      );

      const matrixLivekitMember$ = createMatrixLivekitMembers$({
        scope: testScope,
        membershipsWithTransport$: testScope.behavior(
          membershipsWithTransport$,
        ),
        connectionManager: {
          connectionManagerData$: connectionManagerData$,
        } as unknown as IConnectionManager,
      });

      expectObservable(matrixLivekitMember$.pipe(map((e) => e.value))).toBe(
        "a",
        {
          a: expect.toSatisfy((data: RemoteMatrixLivekitMember[]) => {
            expect(data.length).toEqual(2);
            expectObservable(data[0].membership$).toBe("a", {
              a: bobMembership,
            });
            expectObservable(data[0].connection$).toBe("a", {
              // The real connection should be from transportA as per the membership
              a: connectionA,
            });
            expectObservable(data[0].participant.value$).toBe("a", {
              // No participant as Bob is not publishing on his membership transport
              a: null,
            });
            return true;
          }),
        },
      );
    });
  });
});

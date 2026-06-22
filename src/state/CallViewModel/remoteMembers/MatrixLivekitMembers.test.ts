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
import { BehaviorSubject, combineLatest, map, type Observable } from "rxjs";

import { type IConnectionManager } from "./ConnectionManager.ts";
import {
  type RemoteMatrixLivekitMember,
  createRemoteMatrixLivekitMembers$,
} from "./MatrixLivekitMembers.ts";
import {
  Epoch,
  mapEpoch,
  ObservableScope,
  trackEpoch,
} from "../../ObservableScope.ts";
import { ConnectionManagerData } from "./ConnectionManager.ts";
import {
  flushPromises,
  mockRtcMembership,
  mockRemoteParticipant,
} from "../../../utils/test.ts";
import { type Connection } from "./Connection.ts";
import { constant } from "../../Behavior.ts";
import { localRtcMember } from "../../../utils/test-fixtures.ts";

let testScope: ObservableScope;

const fallbackMemberId = (userId: string, deviceId: string): string =>
  `${userId}:${deviceId}`;

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

const bobMembership = mockRtcMembership("@bob:example.org", "DEV000", {
  fociPreferred: [transportA],
});
const carlMembership = mockRtcMembership("@carl:sample.com", "DEV111", {
  fociPreferred: [transportB],
});

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

test("should signal participant not yet connected to livekit", async () => {
  const mockedMemberships$ = new BehaviorSubject([bobMembership]);
  const mockConnectionManagerData$ = new BehaviorSubject(
    new ConnectionManagerData(),
  );
  const { memberships$, membershipsWithTransport$ } =
    createEpochedMemberships$(mockedMemberships$);

  const connectionManagerData$ = epochMeWith$(
    memberships$,
    mockConnectionManagerData$,
  );

  const remoteMatrixLivekitMembers$ = createRemoteMatrixLivekitMembers$({
    scope: testScope,
    membershipsWithTransport$: testScope.behavior(membershipsWithTransport$),
    connectionManager: {
      connectionManagerData$: connectionManagerData$,
    } as unknown as IConnectionManager,
    localUser: localRtcMember,
  });

  await flushPromises();
  expect(remoteMatrixLivekitMembers$.value.value).toSatisfy(
    (data: RemoteMatrixLivekitMember[]) => {
      expect(data.length).toEqual(1);
      expect(data[0].membership$.value).toBe(bobMembership);
      expect(data[0].participant.value$.value).toBe(null);
      expect(data[0].connection$.value).toBe(null);
      return true;
    },
  );
});

// Helper to create epoch'ed memberships$ and membershipsWithTransport$ from memberships observable.
function createEpochedMemberships$(m$: Observable<CallMembership[]>): {
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

test("should signal participant on a connection that is publishing", async () => {
  const bobParticipantId = fallbackMemberId(
    bobMembership.userId,
    bobMembership.deviceId,
  );

  const { memberships$, membershipsWithTransport$ } = createEpochedMemberships$(
    constant([bobMembership]),
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
    constant(dataWithPublisher),
  );

  const remoteMatrixLivekitMembers$ = createRemoteMatrixLivekitMembers$({
    scope: testScope,
    membershipsWithTransport$: testScope.behavior(membershipsWithTransport$),
    connectionManager: {
      connectionManagerData$: connectionManagerData$,
    } as unknown as IConnectionManager,
    localUser: localRtcMember,
  });

  await flushPromises();
  expect(remoteMatrixLivekitMembers$.value.value).toSatisfy(
    (data: RemoteMatrixLivekitMember[]) => {
      expect(data.length).toEqual(1);
      expect(data[0].membership$.value).toBe(bobMembership);
      expect(data[0].participant.value$.value).toSatisfy((participant) => {
        expect(participant).toBeDefined();
        expect(participant!.identity).toEqual(bobParticipantId);
        return true;
      });
      expect(data[0].connection$.value).toBe(connection);
      return true;
    },
  );
});

test("should signal participant on a connection that is not publishing", async () => {
  const { memberships$, membershipsWithTransport$ } = createEpochedMemberships$(
    constant([bobMembership]),
  );

  const connection = {
    transport: bobMembership.getTransport(bobMembership),
  } as unknown as Connection;
  const dataWithPublisher = new ConnectionManagerData();
  dataWithPublisher.add(connection, []);

  const connectionManagerData$ = epochMeWith$(
    memberships$,
    constant(dataWithPublisher),
  );

  const remoteMatrixLivekitMembers$ = createRemoteMatrixLivekitMembers$({
    scope: testScope,
    membershipsWithTransport$: testScope.behavior(membershipsWithTransport$),
    connectionManager: {
      connectionManagerData$: connectionManagerData$,
    } as unknown as IConnectionManager,
    localUser: localRtcMember,
  });
  await flushPromises();
  expect(remoteMatrixLivekitMembers$.value.value).toSatisfy(
    (data: RemoteMatrixLivekitMember[]) => {
      expect(data.length).toEqual(1);
      expect(data[0].membership$.value).toBe(bobMembership);
      expect(data[0].participant.value$.value).toBe(null);
      expect(data[0].connection$.value).toBe(connection);
      return true;
    },
  );
});

describe("Publication edge case", () => {
  test("bob is publishing in several connections", async () => {
    const { memberships$, membershipsWithTransport$ } =
      createEpochedMemberships$(constant([bobMembership, carlMembership]));

    const connectionWithPublisher = new ConnectionManagerData();
    const bobParticipantId = fallbackMemberId(
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
      constant(connectionWithPublisher),
    );

    const remoteMatrixLivekitMembers$ = createRemoteMatrixLivekitMembers$({
      scope: testScope,
      membershipsWithTransport$: testScope.behavior(membershipsWithTransport$),
      connectionManager: {
        connectionManagerData$: connectionManagerData$,
      } as unknown as IConnectionManager,
      localUser: localRtcMember,
    });
    await flushPromises();
    expect(remoteMatrixLivekitMembers$.value.value).toSatisfy(
      (data: RemoteMatrixLivekitMember[]) => {
        expect(data.length).toEqual(2);
        expect(data[0].membership$.value).toBe(bobMembership);
        expect(data[0].connection$.value).toBe(connectionA);
        expect(data[0].participant.value$.value).toSatisfy((participant) => {
          expect(participant).toBeDefined();
          expect(participant!.identity).toEqual(bobParticipantId);
          return true;
        });

        return true;
      },
    );
  });
});

test("bob is publishing in the wrong connection", async () => {
  const mockedMemberships$ = new BehaviorSubject([
    bobMembership,
    carlMembership,
  ]);

  const { memberships$, membershipsWithTransport$ } =
    createEpochedMemberships$(mockedMemberships$);

  const connectionWithPublisher = new ConnectionManagerData();

  const bobParticipantId = fallbackMemberId(
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

  const connectionsWithPublisher$ = new BehaviorSubject(
    connectionWithPublisher,
  );
  const connectionManagerData$ = epochMeWith$(
    memberships$,
    connectionsWithPublisher$,
  );

  const remoteMatrixLivekitMembers$ = createRemoteMatrixLivekitMembers$({
    scope: testScope,
    membershipsWithTransport$: testScope.behavior(membershipsWithTransport$),
    connectionManager: {
      connectionManagerData$: connectionManagerData$,
    } as unknown as IConnectionManager,
    localUser: localRtcMember,
  });

  await flushPromises();
  expect(remoteMatrixLivekitMembers$.value.value).toSatisfy(
    (data: RemoteMatrixLivekitMember[]) => {
      expect(data.length).toEqual(2);
      expect(data[0].membership$.value).toBe(bobMembership);
      expect(data[0].connection$.value).toBe(connectionA);
      expect(data[0].participant.value$.value).toBe(null);
      return true;
    },
  );
});

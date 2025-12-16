/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BehaviorSubject } from "rxjs";
import { type LivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
import { type RemoteParticipant } from "livekit-client";
import { logger } from "matrix-js-sdk/lib/logger";

import { Epoch, mapEpoch, ObservableScope } from "../../ObservableScope.ts";
import {
  createConnectionManager$,
  type ConnectionManagerData,
} from "./ConnectionManager.ts";
import { type ConnectionFactory } from "./ConnectionFactory.ts";
import { type Connection } from "./Connection.ts";
import { withTestScheduler } from "../../../utils/test.ts";
import { areLivekitTransportsEqual } from "./MatrixLivekitMembers.ts";
import { type Behavior } from "../../Behavior.ts";

// Some test constants

const TRANSPORT_1: LivekitTransport = {
  type: "livekit",
  livekit_service_url: "https://lk.example.org",
  livekit_alias: "!alias:example.org",
};

const TRANSPORT_2: LivekitTransport = {
  type: "livekit",
  livekit_service_url: "https://lk.sample.com",
  livekit_alias: "!alias:sample.com",
};

let fakeConnectionFactory: ConnectionFactory;
let testScope: ObservableScope;

// Can be useful to track all created connections in tests, even the disposed ones
let allCreatedConnections: Connection[];

beforeEach(() => {
  testScope = new ObservableScope();
  allCreatedConnections = [];
  fakeConnectionFactory = {} as unknown as ConnectionFactory;
  vi.mocked(fakeConnectionFactory).createConnection = vi
    .fn()
    .mockImplementation(
      (transport: LivekitTransport, scope: ObservableScope) => {
        const mockConnection = {
          transport,
          remoteParticipants$: new BehaviorSubject([]),
        } as unknown as Connection;
        vi.mocked(mockConnection).start = vi.fn();
        vi.mocked(mockConnection).stop = vi.fn();
        // Tie the connection's lifecycle to the scope to test scope lifecycle management
        scope.onEnd(() => {
          void mockConnection.stop();
        });
        allCreatedConnections.push(mockConnection);
        return mockConnection;
      },
    );
});

afterEach(() => {
  testScope.end();
});

describe("connections$ stream", () => {
  test("Should create and start new connections for each transports", () => {
    withTestScheduler(({ behavior, expectObservable }) => {
      const { connectionManagerData$ } = createConnectionManager$({
        scope: testScope,
        connectionFactory: fakeConnectionFactory,
        inputTransports$: behavior("a", {
          a: new Epoch([TRANSPORT_1, TRANSPORT_2], 0),
        }),
        logger: logger,
      });

      expectObservable(
        connectionManagerData$.pipe(mapEpoch((d) => d.getConnections())),
      ).toBe("a", {
        a: expect.toSatisfy((e: Epoch<Connection[]>) => {
          const connections = e.value;
          expect(connections.length).toBe(2);

          expect(
            vi.mocked(fakeConnectionFactory).createConnection,
          ).toHaveBeenCalledTimes(2);

          const conn1 = connections.find((c) =>
            areLivekitTransportsEqual(c.transport, TRANSPORT_1),
          );
          expect(conn1).toBeDefined();
          expect(conn1!.start).toHaveBeenCalled();

          const conn2 = connections.find((c) =>
            areLivekitTransportsEqual(c.transport, TRANSPORT_2),
          );
          expect(conn2).toBeDefined();
          expect(conn2!.start).toHaveBeenCalled();
          return true;
        }),
      });
    });
  });

  test("Should start connection only once", () => {
    withTestScheduler(({ behavior, expectObservable }) => {
      const { connectionManagerData$ } = createConnectionManager$({
        scope: testScope,
        connectionFactory: fakeConnectionFactory,
        inputTransports$: behavior("abcdef", {
          a: new Epoch([TRANSPORT_1], 0),
          b: new Epoch([TRANSPORT_1], 1),
          c: new Epoch([TRANSPORT_1], 2),
          d: new Epoch([TRANSPORT_1], 3),
          e: new Epoch([TRANSPORT_1], 4),
          f: new Epoch([TRANSPORT_1, TRANSPORT_2], 5),
        }),
        logger: logger,
      });

      expectObservable(
        connectionManagerData$.pipe(mapEpoch((d) => d.getConnections())),
      ).toBe("xxxxxa", {
        x: expect.anything(),
        a: expect.toSatisfy((e: Epoch<Connection[]>) => {
          const connections = e.value;

          expect(connections.length).toBe(2);
          expect(
            vi.mocked(fakeConnectionFactory).createConnection,
          ).toHaveBeenCalledTimes(2);

          const conn2 = connections.find((c) =>
            areLivekitTransportsEqual(c.transport, TRANSPORT_2),
          );
          expect(conn2).toBeDefined();

          const conn1 = connections.find((c) =>
            areLivekitTransportsEqual(c.transport, TRANSPORT_1),
          );
          expect(conn1).toBeDefined();
          expect(conn1!.start).toHaveBeenCalledOnce();

          return true;
        }),
      });
    });
  });

  test("Should cleanup connections when not needed anymore", () => {
    withTestScheduler(({ behavior, expectObservable }) => {
      const { connectionManagerData$ } = createConnectionManager$({
        scope: testScope,
        connectionFactory: fakeConnectionFactory,
        inputTransports$: behavior("abc", {
          a: new Epoch([TRANSPORT_1], 0),
          b: new Epoch([TRANSPORT_1, TRANSPORT_2], 1),
          c: new Epoch([TRANSPORT_1], 2),
        }),
        logger: logger,
      });

      expectObservable(
        connectionManagerData$.pipe(mapEpoch((d) => d.getConnections())),
      ).toBe("xab", {
        x: expect.anything(),
        a: expect.toSatisfy((e: Epoch<Connection[]>) => {
          const connections = e.value;
          expect(connections.length).toBe(2);
          return true;
        }),
        b: expect.toSatisfy((e: Epoch<Connection[]>) => {
          const connections = e.value;

          expect(connections.length).toBe(1);
          // The second connection should have been stopped has it is no longer needed.
          const connection2 = allCreatedConnections.find((c) =>
            areLivekitTransportsEqual(c.transport, TRANSPORT_2),
          );
          expect(connection2).toBeDefined();
          expect(connection2!.stop).toHaveBeenCalled();

          // The first connection should still be active
          const conn1 = connections[0];
          expect(conn1.stop).not.toHaveBeenCalledOnce();

          return true;
        }),
      });
    });
  });
});

describe("connectionManagerData$ stream", () => {
  // Used in test to control fake connections' remoteParticipants$ streams
  let fakeRemoteParticipantsStreams: Map<string, Behavior<RemoteParticipant[]>>;

  function keyForTransport(transport: LivekitTransport): string {
    return `${transport.livekit_service_url}|${transport.livekit_alias}`;
  }

  beforeEach(() => {
    fakeRemoteParticipantsStreams = new Map();

    function getRemoteParticipantsFor(
      transport: LivekitTransport,
    ): Behavior<RemoteParticipant[]> {
      return (
        fakeRemoteParticipantsStreams.get(keyForTransport(transport)) ??
        new BehaviorSubject([])
      );
    }

    // need a more advanced fake connection factory
    vi.mocked(fakeConnectionFactory).createConnection = vi
      .fn()
      .mockImplementation(
        (transport: LivekitTransport, scope: ObservableScope) => {
          const fakeRemoteParticipants$ = new BehaviorSubject<
            RemoteParticipant[]
          >([]);
          const mockConnection = {
            transport,
            remoteParticipants$: getRemoteParticipantsFor(transport),
          } as unknown as Connection;
          vi.mocked(mockConnection).start = vi.fn();
          vi.mocked(mockConnection).stop = vi.fn();
          // Tie the connection's lifecycle to the scope to test scope lifecycle management
          scope.onEnd(() => {
            void mockConnection.stop();
          });

          fakeRemoteParticipantsStreams.set(
            keyForTransport(transport),
            fakeRemoteParticipants$,
          );
          return mockConnection;
        },
      );
  });

  test("Should report connections with the remote participants", () => {
    withTestScheduler(({ expectObservable, schedule, behavior }) => {
      // Setup the fake participants streams behavior
      // ==============================
      fakeRemoteParticipantsStreams.set(
        keyForTransport(TRANSPORT_1),
        behavior("oa-b", {
          o: [],
          a: [{ identity: "user1A" } as RemoteParticipant],
          b: [
            { identity: "user1A" } as RemoteParticipant,
            { identity: "user1B" } as RemoteParticipant,
          ],
        }),
      );

      fakeRemoteParticipantsStreams.set(
        keyForTransport(TRANSPORT_2),
        behavior("o-a", {
          o: [],
          a: [{ identity: "user2A" } as RemoteParticipant],
        }),
      );
      // ==============================

      const { connectionManagerData$ } = createConnectionManager$({
        scope: testScope,
        connectionFactory: fakeConnectionFactory,
        inputTransports$: behavior("a", {
          a: new Epoch([TRANSPORT_1, TRANSPORT_2], 0),
        }),
        logger,
      });

      expectObservable(connectionManagerData$).toBe("abcd", {
        a: expect.toSatisfy((e) => {
          const data: ConnectionManagerData = e.value;
          expect(data.getConnections().length).toBe(2);
          expect(data.getParticipantForTransport(TRANSPORT_1).length).toBe(0);
          expect(data.getParticipantForTransport(TRANSPORT_2).length).toBe(0);
          return true;
        }),
        b: expect.toSatisfy((e) => {
          const data: ConnectionManagerData = e.value;
          expect(data.getConnections().length).toBe(2);
          expect(data.getParticipantForTransport(TRANSPORT_1).length).toBe(1);
          expect(data.getParticipantForTransport(TRANSPORT_2).length).toBe(0);
          expect(data.getParticipantForTransport(TRANSPORT_1)[0].identity).toBe(
            "user1A",
          );
          return true;
        }),
        c: expect.toSatisfy((e) => {
          const data: ConnectionManagerData = e.value;
          expect(data.getConnections().length).toBe(2);
          expect(data.getParticipantForTransport(TRANSPORT_1).length).toBe(1);
          expect(data.getParticipantForTransport(TRANSPORT_2).length).toBe(1);
          expect(data.getParticipantForTransport(TRANSPORT_1)[0].identity).toBe(
            "user1A",
          );
          expect(data.getParticipantForTransport(TRANSPORT_2)[0].identity).toBe(
            "user2A",
          );
          return true;
        }),
        d: expect.toSatisfy((e) => {
          const data: ConnectionManagerData = e.value;
          expect(data.getConnections().length).toBe(2);
          expect(data.getParticipantForTransport(TRANSPORT_1).length).toBe(2);
          expect(data.getParticipantForTransport(TRANSPORT_2).length).toBe(1);
          expect(data.getParticipantForTransport(TRANSPORT_1)[0].identity).toBe(
            "user1A",
          );
          expect(data.getParticipantForTransport(TRANSPORT_1)[1].identity).toBe(
            "user1B",
          );
          expect(data.getParticipantForTransport(TRANSPORT_2)[0].identity).toBe(
            "user2A",
          );
          return true;
        }),
      });
    });
  });
});

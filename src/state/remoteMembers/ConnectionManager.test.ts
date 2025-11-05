/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BehaviorSubject } from "rxjs";
import { type LivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
import { type Participant as LivekitParticipant } from "livekit-client";

import { ObservableScope } from "../ObservableScope.ts";
import { createConnectionManager$ } from "./ConnectionManager.ts";
import { type ConnectionFactory } from "./ConnectionFactory.ts";
import { type Connection } from "./Connection.ts";
import { areLivekitTransportsEqual } from "./matrixLivekitMerger.ts";
import { flushPromises, withTestScheduler } from "../../utils/test.ts";

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

// const TRANSPORT_3: LivekitTransport = {
//   type: "livekit",
//   livekit_service_url: "https://lk-other.sample.com",
//   livekit_alias: "!alias:sample.com",
// };
let fakeConnectionFactory: ConnectionFactory;
let testScope: ObservableScope;
let testTransportStream$: BehaviorSubject<LivekitTransport[]>;
let connectionManagerInputs: {
  scope: ObservableScope;
  connectionFactory: ConnectionFactory;
  inputTransports$: BehaviorSubject<LivekitTransport[]>;
};
let manager: ReturnType<typeof createConnectionManager$>;
beforeEach(() => {
  testScope = new ObservableScope();

  fakeConnectionFactory = {} as unknown as ConnectionFactory;
  vi.mocked(fakeConnectionFactory).createConnection = vi
    .fn()
    .mockImplementation(
      (transport: LivekitTransport, scope: ObservableScope) => {
        const mockConnection = {
          transport,
        } as unknown as Connection;
        vi.mocked(mockConnection).start = vi.fn();
        vi.mocked(mockConnection).stop = vi.fn();
        // Tie the connection's lifecycle to the scope to test scope lifecycle management
        scope.onEnd(() => {
          void mockConnection.stop();
        });
        return mockConnection;
      },
    );

  testTransportStream$ = new BehaviorSubject<LivekitTransport[]>([]);
  connectionManagerInputs = {
    scope: testScope,
    connectionFactory: fakeConnectionFactory,
    inputTransports$: testTransportStream$,
  };
  manager = createConnectionManager$(connectionManagerInputs);
});

afterEach(() => {
  testScope.end();
});

describe("connections$ stream", () => {
  test("Should create and start new connections for each transports", async () => {
    const managedConnections = Promise.withResolvers<Connection[]>();
    manager.connections$.subscribe((connections) => {
      if (connections.length > 0) managedConnections.resolve(connections);
    });

    connectionManagerInputs.inputTransports$.next([TRANSPORT_1, TRANSPORT_2]);

    const connections = await managedConnections.promise;

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
  });

  test("Should start connection only once", async () => {
    const observedConnections: Connection[][] = [];
    manager.connections$.subscribe((connections) => {
      observedConnections.push(connections);
    });

    testTransportStream$.next([TRANSPORT_1]);
    testTransportStream$.next([TRANSPORT_1]);
    testTransportStream$.next([TRANSPORT_1]);
    testTransportStream$.next([TRANSPORT_1]);
    testTransportStream$.next([TRANSPORT_1]);
    testTransportStream$.next([TRANSPORT_1, TRANSPORT_2]);

    await flushPromises();
    const connections = observedConnections.pop()!;

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
  });

  test("Should cleanup connections when not needed anymore", async () => {
    const observedConnections: Connection[][] = [];
    manager.connections$.subscribe((connections) => {
      observedConnections.push(connections);
    });

    testTransportStream$.next([TRANSPORT_1]);
    testTransportStream$.next([TRANSPORT_1, TRANSPORT_2]);

    await flushPromises();

    const conn2 = observedConnections
      .pop()!
      .find((c) => areLivekitTransportsEqual(c.transport, TRANSPORT_2))!;

    testTransportStream$.next([TRANSPORT_1]);

    await flushPromises();

    // The second connection should have been stopped has it is no longer needed
    expect(conn2.stop).toHaveBeenCalled();

    // The first connection should still be active
    const conn1 = observedConnections.pop()![0];
    expect(conn1.stop).not.toHaveBeenCalledOnce();
  });
});

describe("connectionManagerData$ stream", () => {
  // Used in test to control fake connections' participantsWithTrack$ streams
  let fakePublishingParticipantsStreams: Map<
    string,
    BehaviorSubject<LivekitParticipant[]>
  >;

  function keyForTransport(transport: LivekitTransport): string {
    return `${transport.livekit_service_url}|${transport.livekit_alias}`;
  }

  beforeEach(() => {
    fakePublishingParticipantsStreams = new Map();
    // need a more advanced fake connection factory
    vi.mocked(fakeConnectionFactory).createConnection = vi
      .fn()
      .mockImplementation(
        (transport: LivekitTransport, scope: ObservableScope) => {
          const fakePublishingParticipants$ = new BehaviorSubject<
            LivekitParticipant[]
          >([]);
          const mockConnection = {
            transport,
            participantsWithTrack$: fakePublishingParticipants$,
          } as unknown as Connection;
          vi.mocked(mockConnection).start = vi.fn();
          vi.mocked(mockConnection).stop = vi.fn();
          // Tie the connection's lifecycle to the scope to test scope lifecycle management
          scope.onEnd(() => {
            void mockConnection.stop();
          });

          fakePublishingParticipantsStreams.set(
            keyForTransport(transport),
            fakePublishingParticipants$,
          );
          return mockConnection;
        },
      );
  });

  test("Should report connections with the publishing participants", () => {
    withTestScheduler(({ expectObservable, schedule, behavior }) => {
      manager = createConnectionManager$({
        ...connectionManagerInputs,
        inputTransports$: behavior("a", {
          a: [TRANSPORT_1, TRANSPORT_2],
        }),
      });

      const conn1Participants$ = fakePublishingParticipantsStreams.get(
        keyForTransport(TRANSPORT_1),
      )!;

      schedule("-a-b", {
        a: () => {
          conn1Participants$.next([
            { identity: "user1A" } as LivekitParticipant,
          ]);
        },
        b: () => {
          conn1Participants$.next([
            { identity: "user1A" } as LivekitParticipant,
            { identity: "user1B" } as LivekitParticipant,
          ]);
        },
      });

      const conn2Participants$ = fakePublishingParticipantsStreams.get(
        keyForTransport(TRANSPORT_2),
      )!;

      schedule("--a", {
        a: () => {
          conn2Participants$.next([
            { identity: "user2A" } as LivekitParticipant,
          ]);
        },
      });

      expectObservable(manager.connectionManagerData$).toBe("abcd", {
        a: expect.toSatisfy((data) => {
          return (
            data.getConnections().length == 2 &&
            data.getParticipantForTransport(TRANSPORT_1).length == 0 &&
            data.getParticipantForTransport(TRANSPORT_2).length == 0
          );
        }),
        b: expect.toSatisfy((data) => {
          return (
            data.getConnections().length == 2 &&
            data.getParticipantForTransport(TRANSPORT_1).length == 1 &&
            data.getParticipantForTransport(TRANSPORT_2).length == 0 &&
            data.getParticipantForTransport(TRANSPORT_1)[0].identity == "user1A"
          );
        }),
        c: expect.toSatisfy((data) => {
          return (
            data.getConnections().length == 2 &&
            data.getParticipantForTransport(TRANSPORT_1).length == 1 &&
            data.getParticipantForTransport(TRANSPORT_2).length == 1 &&
            data.getParticipantForTransport(TRANSPORT_1)[0].identity ==
              "user1A" &&
            data.getParticipantForTransport(TRANSPORT_2)[0].identity == "user2A"
          );
        }),
        d: expect.toSatisfy((data) => {
          return (
            data.getConnections().length == 2 &&
            data.getParticipantForTransport(TRANSPORT_1).length == 2 &&
            data.getParticipantForTransport(TRANSPORT_2).length == 1 &&
            data.getParticipantForTransport(TRANSPORT_1)[0].identity ==
              "user1A" &&
            data.getParticipantForTransport(TRANSPORT_1)[1].identity ==
              "user1B" &&
            data.getParticipantForTransport(TRANSPORT_2)[0].identity == "user2A"
          );
        }),
      });
    });
  });
});

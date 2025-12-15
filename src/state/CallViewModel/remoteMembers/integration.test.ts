/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { test, vi, expect, beforeEach, afterEach } from "vitest";
import { BehaviorSubject } from "rxjs";
import { type Room as LivekitRoom } from "livekit-client";
import EventEmitter from "events";
import fetchMock from "fetch-mock";
import { type LivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
import { logger } from "matrix-js-sdk/lib/logger";

import {
  type Epoch,
  ObservableScope,
  trackEpoch,
} from "../../ObservableScope.ts";
import { ECConnectionFactory } from "./ConnectionFactory.ts";
import { type OpenIDClientParts } from "../../../livekit/openIDSFU.ts";
import {
  mockCallMembership,
  mockMediaDevices,
  withTestScheduler,
} from "../../../utils/test.ts";
import { type ProcessorState } from "../../../livekit/TrackProcessorContext.tsx";
import {
  areLivekitTransportsEqual,
  createMatrixLivekitMembers$,
  type RemoteMatrixLivekitMember,
} from "./MatrixLivekitMembers.ts";
import { createConnectionManager$ } from "./ConnectionManager.ts";
import { membershipsAndTransports$ } from "../../SessionBehaviors.ts";

// Test the integration of ConnectionManager and MatrixLivekitMerger

let testScope: ObservableScope;
let ecConnectionFactory: ECConnectionFactory;
let mockClient: OpenIDClientParts;
let lkRoomFactory: () => LivekitRoom;

const createdMockLivekitRooms: Map<string, LivekitRoom> = new Map();

beforeEach(() => {
  testScope = new ObservableScope();
  mockClient = {
    getOpenIdToken: vi.fn().mockReturnValue(""),
    getDeviceId: vi.fn().mockReturnValue("DEV000"),
  };

  lkRoomFactory = vi.fn().mockImplementation(() => {
    const emitter = new EventEmitter();
    const base = {
      on: emitter.on.bind(emitter),
      off: emitter.off.bind(emitter),
      emit: emitter.emit.bind(emitter),
      disconnect: vi.fn(),
      remoteParticipants: new Map(),
    } as unknown as LivekitRoom;

    vi.mocked(base).connect = vi.fn().mockImplementation(({ url }) => {
      createdMockLivekitRooms.set(url, base);
    });
    return base;
  });

  ecConnectionFactory = new ECConnectionFactory(
    mockClient,
    mockMediaDevices({}),
    new BehaviorSubject<ProcessorState>({
      supported: true,
      processor: undefined,
    }),
    undefined,
    false,
    lkRoomFactory,
  );

  //TODO a bit annoying to have to do a http mock?
  fetchMock.post(`path:/sfu/get`, (url) => {
    const domain = new URL(url).hostname; // Extract the domain from the URL
    return {
      status: 200,
      body: {
        url: `wss://${domain}/livekit/sfu`,
        jwt: "ATOKEN",
      },
    };
  });
});

afterEach(() => {
  testScope.end();
  fetchMock.reset();
});

test("bob, carl, then bob joining no tracks yet", () => {
  withTestScheduler(({ expectObservable, behavior, scope }) => {
    const bobMembership = mockCallMembership("@bob:example.com", "BDEV000");
    const carlMembership = mockCallMembership("@carl:example.com", "CDEV000");
    const daveMembership = mockCallMembership("@dave:foo.bar", "DDEV000");

    const eMarble = "abc";
    const vMarble = "abc";
    const memberships$ = scope.behavior(
      behavior(eMarble, {
        a: [bobMembership],
        b: [bobMembership, carlMembership],
        c: [bobMembership, carlMembership, daveMembership],
      }).pipe(trackEpoch()),
    );

    const membershipsAndTransports = membershipsAndTransports$(
      testScope,
      memberships$,
    );

    const connectionManager = createConnectionManager$({
      scope: testScope,
      connectionFactory: ecConnectionFactory,
      inputTransports$: membershipsAndTransports.transports$,
      logger: logger,
    });

    const matrixLivekitItems$ = createMatrixLivekitMembers$({
      scope: testScope,
      membershipsWithTransport$:
        membershipsAndTransports.membershipsWithTransport$,
      connectionManager,
    });

    expectObservable(matrixLivekitItems$).toBe(vMarble, {
      a: expect.toSatisfy((e: Epoch<RemoteMatrixLivekitMember[]>) => {
        const items = e.value;
        expect(items.length).toBe(1);
        const item = items[0]!;
        expectObservable(item.membership$).toBe("a", {
          a: bobMembership,
        });
        expectObservable(item.connection$).toBe("a", {
          a: expect.toSatisfy((co) =>
            areLivekitTransportsEqual(
              co.transport,
              bobMembership.transports[0]! as LivekitTransport,
            ),
          ),
        });
        expectObservable(item.participant.value$).toBe("a", {
          a: null,
        });
        return true;
      }),
      b: expect.toSatisfy((e: Epoch<RemoteMatrixLivekitMember[]>) => {
        const items = e.value;
        expect(items.length).toBe(2);

        {
          const item = items[0]!;
          expectObservable(item.membership$).toBe("a", {
            a: bobMembership,
          });
          expectObservable(item.participant.value$).toBe("a", {
            a: null,
          });
        }

        {
          const item = items[1]!;

          expectObservable(item.membership$).toBe("a", {
            a: carlMembership,
          });
          expectObservable(item.participant.value$).toBe("a", {
            a: null,
          });
          expectObservable(item.connection$).toBe("a", {
            a: expect.toSatisfy((connection) => {
              expect(
                areLivekitTransportsEqual(
                  connection.transport,
                  carlMembership.transports[0]! as LivekitTransport,
                ),
              ).toBe(true);
              return true;
            }),
          });
        }
        return true;
      }),
      c: expect.toSatisfy((e: Epoch<RemoteMatrixLivekitMember[]>) => {
        const items = e.value;
        expect(items.length).toBe(3);

        expectObservable(items[0].membership$).toBe("a", {
          a: bobMembership,
        });
        expectObservable(items[1].membership$).toBe("b", {
          a: carlMembership,
        });

        {
          const item = items[2]!;
          expectObservable(item.membership$).toBe("a", {
            a: daveMembership,
          });
          expectObservable(item.connection$).toBe("a", {
            a: expect.toSatisfy((connection) => {
              expect(
                areLivekitTransportsEqual(
                  connection.transport,
                  daveMembership.transports[0]! as LivekitTransport,
                ),
              ).toBe(true);
              return true;
            }),
          });
          expectObservable(item.participant.value$).toBe("a", {
            a: null,
          });
        }
        return true;
      }),
      x: expect.anything(),
    });
  });
});

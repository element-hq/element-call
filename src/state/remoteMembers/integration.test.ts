/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { test, vi, expect, beforeEach, afterEach } from "vitest";
import { BehaviorSubject, map } from "rxjs";
import { type Room as LivekitRoom } from "livekit-client";
import EventEmitter from "events";
import fetchMock from "fetch-mock";
import { type LivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
import { type Room as MatrixRoom, type RoomMember } from "matrix-js-sdk";

import { ObservableScope } from "../ObservableScope.ts";
import { ECConnectionFactory } from "./ConnectionFactory.ts";
import { type OpenIDClientParts } from "../../livekit/openIDSFU.ts";
import {
  mockCallMembership,
  mockMediaDevices,
  withTestScheduler,
} from "../../utils/test";
import { type ProcessorState } from "../../livekit/TrackProcessorContext.tsx";
import {
  createMatrixLivekitMembers$,
  type MatrixLivekitMember,
} from "./MatrixLivekitMembers.ts";
import {
  ConnectionManagerData,
  createConnectionManager$,
} from "./ConnectionManager.ts";
import { membershipsAndTransports$ } from "../SessionBehaviors.ts";
import { Connection } from "./Connection.ts";

// Test the integration of ConnectionManager and MatrixLivekitMerger

let testScope: ObservableScope;
let ecConnectionFactory: ECConnectionFactory;
let mockClient: OpenIDClientParts;
let lkRoomFactory: () => LivekitRoom;
let mockMatrixRoom: MatrixRoom;

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
  fetchMock.reset();
});

test("example test 2", () => {
  withTestScheduler(({ schedule, expectObservable, behavior, cold }) => {
    const bobMembership = mockCallMembership("@bob:example.com", "BDEV000");
    const carlMembership = mockCallMembership("@carl:example.com", "CDEV000");
    const daveMembership = mockCallMembership("@dave:foo.bar", "DDEV000");
    const memberships$ = behavior("abc", {
      a: [bobMembership],
      b: [bobMembership, carlMembership],
      c: [bobMembership, carlMembership, daveMembership],
    });

    const membershipsAndTransports = membershipsAndTransports$(
      testScope,
      memberships$,
    );

    const connectionManager = createConnectionManager$({
      scope: testScope,
      connectionFactory: ecConnectionFactory,
      inputTransports$: membershipsAndTransports.transports$,
    });

    const matrixLivekitItems$ = createMatrixLivekitMembers$({
      scope: testScope,
      membershipsWithTransport$:
        membershipsAndTransports.membershipsWithTransport$,
      connectionManager,
      matrixRoom: mockMatrixRoom,
    });

    expectObservable(membershipsAndTransports.transports$).toBe("abc", {
      a: expect.toSatisfy((t: LivekitTransport[]) => t.length === 1),
      b: expect.toSatisfy((t: LivekitTransport[]) => t.length === 2),
      c: expect.toSatisfy((t: LivekitTransport[]) => t.length === 3),
    });

    expectObservable(membershipsAndTransports.membershipsWithTransport$).toBe(
      "abc",
      {
        a: expect.toSatisfy((t: LivekitTransport[]) => t.length === 1),
        b: expect.toSatisfy((t: LivekitTransport[]) => t.length === 2),
        c: expect.toSatisfy((t: LivekitTransport[]) => t.length === 3),
      },
    );

    expectObservable(connectionManager.transports$).toBe("abc", {
      a: expect.toSatisfy((t: LivekitTransport[]) => t.length === 1),
      b: expect.toSatisfy((t: LivekitTransport[]) => t.length === 1),
      c: expect.toSatisfy((t: LivekitTransport[]) => t.length === 2),
    });

    expectObservable(connectionManager.connectionManagerData$).toBe("abc", {
      a: expect.toSatisfy(
        (d: ConnectionManagerData) => d.getConnections().length === 1,
      ),
      b: expect.toSatisfy(
        (d: ConnectionManagerData) => d.getConnections().length === 1,
      ),
      c: expect.toSatisfy(
        (d: ConnectionManagerData) => d.getConnections().length === 2,
      ),
    });

    expectObservable(connectionManager.connections$).toBe("abc", {
      a: expect.toSatisfy((t: Connection[]) => t.length === 1),
      b: expect.toSatisfy((t: Connection[]) => t.length === 1),
      c: expect.toSatisfy((t: Connection[]) => t.length === 2),
    });

    expectObservable(matrixLivekitItems$).toBe("abc", {
      a: expect.toSatisfy((items: MatrixLivekitMember[]) => {
        // expect(items.length).toBe(1);
        // const item = items[0]!;
        // expect(item.membership).toStrictEqual(bobMembership);
        // expect(item.participant).toBeUndefined();
        return true;
      }),
      b: expect.toSatisfy((items: MatrixLivekitMember[]) => {
        return true;
      }),
      c: expect.toSatisfy(() => true),
    });
  });
});

// test("Tryng", () => {
//
//   withTestScheduler(({ schedule, expectObservable, behavior, cold }) => {
//     const one = cold("a-b-c", { a: 1, b: 2, c: 3 });
//     const a = one.pipe(map(() => 1));
//     const b = one.pipe(map(() => 2));
//     const combined = combineLatest([a,b])
//       .pipe(map(([a,b])=>`${a}${b}`));
//     expectObservable(combined).toBe("a-b-c", { a: 1, b: expect.anything(), c: 3 });
//
//   })
// })

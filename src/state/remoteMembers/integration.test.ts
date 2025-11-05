/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { test, vi, beforeEach, afterEach } from "vitest";
import { BehaviorSubject, type Observable } from "rxjs";
import { type Room as LivekitRoom } from "livekit-client";
import { logger } from "matrix-js-sdk/lib/logger";
import EventEmitter from "events";
import fetchMock from "fetch-mock";

import { ConnectionManager } from "./ConnectionManager.ts";
import { ObservableScope } from "../ObservableScope.ts";
import { ECConnectionFactory } from "./ConnectionFactory.ts";
import { type OpenIDClientParts } from "../../livekit/openIDSFU.ts";
import { mockMediaDevices, withTestScheduler } from "../../utils/test";
import { type ProcessorState } from "../../livekit/TrackProcessorContext.tsx";
import { matrixLivekitMerger$ } from "./matrixLivekitMerger.ts";
import type { CallMembership, Transport } from "matrix-js-sdk/lib/matrixrtc";
import { TRANSPORT_1 } from "./ConnectionManager.test.ts";

// Test the integration of ConnectionManager and MatrixLivekitMerger

let testScope: ObservableScope;
let ecConnectionFactory: ECConnectionFactory;
let mockClient: OpenIDClientParts;
let lkRoomFactory: () => LivekitRoom;

const createdMockLivekitRooms: Map<string, LivekitRoom> = new Map();

// Main test input
const memberships$ = new BehaviorSubject<CallMembership[]>([]);

// under test
let connectionManager: ConnectionManager;

function createLkMerger(
  memberships$: Observable<CallMembership[]>,
): matrixLivekitMerger$ {
  const mockRoomEmitter = new EventEmitter();
  return new matrixLivekitMerger$(
    testScope,
    memberships$,
    connectionManager,
    {
      on: mockRoomEmitter.on.bind(mockRoomEmitter),
      off: mockRoomEmitter.off.bind(mockRoomEmitter),
      getMember: vi.fn().mockReturnValue(undefined),
    },
    "@user:example.com",
    "DEV000",
  );
}

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

  connectionManager = new ConnectionManager(
    testScope,
    ecConnectionFactory,
    logger,
  );

  //TODO a bit annoying to have to do a http mock?
  fetchMock.post(`**/sfu/get`, (url) => {
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

test("example test", () => {
  withTestScheduler(({ schedule, expectObservable, cold }) => {
    connectionManager.connections$.subscribe((connections) => {
      // console.log(
      //   "Connections updated:",
      //   connections.map((c) => c.transport),
      // );
    });

    const memberships$ = cold("-a-b-c", {
      a: [mockCallmembership("@bob:example.com", "BDEV000")],
      b: [
        mockCallmembership("@bob:example.com", "BDEV000"),
        mockCallmembership("@carl:example.com", "CDEV000"),
      ],
      c: [
        mockCallmembership("@bob:example.com", "BDEV000"),
        mockCallmembership("@carl:example.com", "CDEV000"),
        mockCallmembership("@dave:foo.bar", "DDEV000"),
      ],
    });

    // TODO IN PROGRESS
    const merger = createLkMerger(memberships$);
  });
});

function mockCallmembership(
  userId: string,
  deviceId: string,
  transport?: Transport,
): CallMembership {
  const t = transport ?? TRANSPORT_1;
  return {
    userId: userId,
    deviceId: deviceId,
    getTransport: vi.fn().mockReturnValue(t),
    transports: [t],
  } as unknown as CallMembership;
}

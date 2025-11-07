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
import { type Room as MatrixRoom, type RoomMember } from "matrix-js-sdk";
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
  type MatrixLivekitMember,
} from "./MatrixLivekitMembers.ts";
import { createConnectionManager$ } from "./ConnectionManager.ts";
import { membershipsAndTransports$ } from "../../SessionBehaviors.ts";

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
    });

    const matrixLivekitItems$ = createMatrixLivekitMembers$({
      scope: testScope,
      membershipsWithTransport$:
        membershipsAndTransports.membershipsWithTransport$,
      connectionManager,
      matrixRoom: mockMatrixRoom,
    });

    expectObservable(matrixLivekitItems$).toBe(vMarble, {
      a: expect.toSatisfy((e: Epoch<MatrixLivekitMember[]>) => {
        const items = e.value;
        expect(items.length).toBe(1);
        const item = items[0]!;
        expect(item.membership).toStrictEqual(bobMembership);
        expect(
          areLivekitTransportsEqual(
            item.connection!.transport,
            bobMembership.transports[0]! as LivekitTransport,
          ),
        ).toBe(true);
        expect(item.participant).toBeUndefined();
        return true;
      }),
      b: expect.toSatisfy((e: Epoch<MatrixLivekitMember[]>) => {
        const items = e.value;
        expect(items.length).toBe(2);

        {
          const item = items[0]!;
          expect(item.membership).toStrictEqual(bobMembership);
          expect(item.participant).toBeUndefined();
        }

        {
          const item = items[1]!;
          expect(item.membership).toStrictEqual(carlMembership);
          expect(item.participantId).toStrictEqual(
            `${carlMembership.userId}:${carlMembership.deviceId}`,
          );
          expect(
            areLivekitTransportsEqual(
              item.connection!.transport,
              carlMembership.transports[0]! as LivekitTransport,
            ),
          ).toBe(true);
          expect(item.participant).toBeUndefined();
        }
        return true;
      }),
      c: expect.toSatisfy((e: Epoch<MatrixLivekitMember[]>) => {
        const items = e.value;
        logger.info(`E Items length: ${items.length}`);
        expect(items.length).toBe(3);
        {
          expect(items[0]!.membership).toStrictEqual(bobMembership);
        }

        {
          expect(items[1]!.membership).toStrictEqual(carlMembership);
        }

        {
          const item = items[2]!;
          expect(item.membership).toStrictEqual(daveMembership);
          expect(item.participantId).toStrictEqual(
            `${daveMembership.userId}:${daveMembership.deviceId}`,
          );
          expect(
            areLivekitTransportsEqual(
              item.connection!.transport,
              daveMembership.transports[0]! as LivekitTransport,
            ),
          ).toBe(true);
          expect(item.participant).toBeUndefined();
        }
        return true;
      }),
      x: expect.anything(),
    });
  });
});

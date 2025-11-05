/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  describe,
  test,
  vi,
  expect,
  beforeEach,
  afterEach,
  type MockedObject,
} from "vitest";
import { BehaviorSubject, take } from "rxjs";
import {
  type CallMembership,
  type LivekitTransport,
} from "matrix-js-sdk/lib/matrixrtc";
import { type Room as MatrixRoom } from "matrix-js-sdk";
import { getParticipantId } from "matrix-js-sdk/lib/matrixrtc/utils";

import {
  type MatrixLivekitMember,
  MatrixLivekitMerger,
} from "./matrixLivekitMerger";
import { ObservableScope } from "../ObservableScope";
import {
  type ConnectionManager,
  ConnectionManagerData,
} from "./ConnectionManager";
import { aliceRtcMember } from "../../utils/test-fixtures";
import { mockRemoteParticipant } from "../../utils/test.ts";
import { type Connection } from "./Connection.ts";

let testScope: ObservableScope;
let fakeManagerData$: BehaviorSubject<ConnectionManagerData>;
let fakeMemberships$: BehaviorSubject<CallMembership[]>;
let mockConnectionManager: MockedObject<ConnectionManager>;
let mockMatrixRoom: MatrixRoom;
const userId = "@local:example.com";
const deviceId = "DEVICE000";

// The merger beeing tested
let matrixLivekitMerger: MatrixLivekitMerger;

beforeEach(() => {
  testScope = new ObservableScope();
  fakeMemberships$ = new BehaviorSubject<CallMembership[]>([]);
  fakeManagerData$ = new BehaviorSubject<ConnectionManagerData>(
    new ConnectionManagerData(),
  );
  mockConnectionManager = vi.mocked<ConnectionManager>({
    registerTransports: vi.fn(),
    connectionManagerData$: fakeManagerData$,
  } as unknown as ConnectionManager);
  mockMatrixRoom = vi.mocked<MatrixRoom>({
    getMember: vi.fn().mockReturnValue(null),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MatrixRoom);

  matrixLivekitMerger = new MatrixLivekitMerger(
    testScope,
    fakeMemberships$,
    mockConnectionManager,
    mockMatrixRoom,
    userId,
    deviceId,
  );
});

afterEach(() => {
  testScope.end();
});

test("should signal participant not yet connected to livekit", () => {
  fakeMemberships$.next([aliceRtcMember]);

  let items: MatrixLivekitMember[] = [];
  matrixLivekitMerger.matrixLivekitMember$
    .pipe(take(1))
    .subscribe((emitted) => {
      items = emitted;
    });

  expect(items).toHaveLength(1);
  const item = items[0];

  // Assert the expected membership
  expect(item.membership).toBe(aliceRtcMember);

  // Assert participant & connection are absent (not just `undefined`)
  expect(item.participant).not.toBeDefined();
  expect(item.participant).not.toBeDefined();
});

test("should signal participant on a connection that is publishing", () => {
  const fakeConnection = {
    transport: aliceRtcMember.getTransport(aliceRtcMember) as LivekitTransport,
  } as unknown as Connection;

  fakeMemberships$.next([aliceRtcMember]);
  const aliceParticipantId = getParticipantId(
    aliceRtcMember.userId,
    aliceRtcMember.deviceId,
  );

  const managerData: ConnectionManagerData = new ConnectionManagerData();
  managerData.add(fakeConnection, [
    mockRemoteParticipant({ identity: aliceParticipantId }),
  ]);
  fakeManagerData$.next(managerData);

  let items: MatrixLivekitMember[] = [];
  matrixLivekitMerger.matrixLivekitMember$
    .pipe(take(1))
    .subscribe((emitted) => {
      items = emitted;
    });
  expect(items).toHaveLength(1);
  const item = items[0];

  // Assert the expected membership
  expect(item.membership).toBe(aliceRtcMember);
  expect(item.participant?.identity).toBe(aliceParticipantId);
  expect(item.connection?.transport).toEqual(fakeConnection.transport);
});

test("should signal participant on a connection that is not publishing", () => {
  const fakeConnection = {
    transport: aliceRtcMember.getTransport(aliceRtcMember) as LivekitTransport,
  } as unknown as Connection;

  fakeMemberships$.next([aliceRtcMember]);

  const managerData: ConnectionManagerData = new ConnectionManagerData();
  managerData.add(fakeConnection, []);
  fakeManagerData$.next(managerData);

  matrixLivekitMerger.matrixLivekitMember$.pipe(take(1)).subscribe((items) => {
    expect(items).toHaveLength(1);
    const item = items[0];

    // Assert the expected membership
    expect(item.membership).toBe(aliceRtcMember);
    expect(item.participant).not.toBeDefined();
    // We have the connection
    expect(item.connection?.transport).toEqual(fakeConnection.transport);
  });
});

describe("Publication edge case", () => {
  const connectionA = {
    transport: {
      type: "livekit",
      livekit_service_url: "https://lk.example.org",
      livekit_alias: "!alias:example.org",
    },
  } as unknown as Connection;

  const connectionB = {
    transport: {
      type: "livekit",
      livekit_service_url: "https://lk.sample.com",
      livekit_alias: "!alias:sample.com",
    },
  } as unknown as Connection;

  const bobMembership = {
    userId: "@bob:example.org",
    deviceId: "DEV000",
    transports: [connectionA.transport],
  } as unknown as CallMembership;

  const bobParticipantId = getParticipantId(
    bobMembership.userId,
    bobMembership.deviceId,
  );

  test("bob is publishing in several connections", () => {
    let lastMatrixLkItems: MatrixLivekitMember[] = [];
    matrixLivekitMerger.matrixLivekitMember$.subscribe((items) => {
      lastMatrixLkItems = items;
    });

    vi.mocked(bobMembership).getTransport = vi
      .fn()
      .mockReturnValue(connectionA.transport);

    fakeMemberships$.next([bobMembership]);

    const lkMap = new ConnectionManagerData();
    lkMap.add(connectionA, [
      mockRemoteParticipant({ identity: bobParticipantId }),
    ]);
    lkMap.add(connectionB, [
      mockRemoteParticipant({ identity: bobParticipantId }),
    ]);

    fakeManagerData$.next(lkMap);

    const items = lastMatrixLkItems;
    expect(items).toHaveLength(1);
    const item = items[0];

    // Assert the expected membership
    expect(item.membership.userId).toEqual(bobMembership.userId);
    expect(item.membership.deviceId).toEqual(bobMembership.deviceId);

    expect(item.participant?.identity).toEqual(bobParticipantId);

    // The transport info should come from the membership transports and not only from the publishing connection
    expect(item.connection?.transport?.livekit_service_url).toEqual(
      bobMembership.transports[0]?.livekit_service_url,
    );
    expect(item.connection?.transport?.livekit_alias).toEqual(
      bobMembership.transports[0]?.livekit_alias,
    );
  });

  test("bob is publishing in the wrong connection", () => {
    let lastMatrixLkItems: MatrixLivekitMember[] = [];
    matrixLivekitMerger.matrixLivekitMember$.subscribe((items) => {
      lastMatrixLkItems = items;
    });

    vi.mocked(bobMembership).getTransport = vi
      .fn()
      .mockReturnValue(connectionA.transport);

    fakeMemberships$.next([bobMembership]);

    const lkMap = new ConnectionManagerData();
    lkMap.add(connectionA, []);
    lkMap.add(connectionB, [
      mockRemoteParticipant({ identity: bobParticipantId }),
    ]);

    fakeManagerData$.next(lkMap);

    const items = lastMatrixLkItems;
    expect(items).toHaveLength(1);
    const item = items[0];

    // Assert the expected membership
    expect(item.membership.userId).toEqual(bobMembership.userId);
    expect(item.membership.deviceId).toEqual(bobMembership.deviceId);

    expect(item.participant).not.toBeDefined();

    // The transport info should come from the membership transports and not only from the publishing connection
    expect(item.connection?.transport?.livekit_service_url).toEqual(
      bobMembership.transports[0]?.livekit_service_url,
    );
    expect(item.connection?.transport?.livekit_alias).toEqual(
      bobMembership.transports[0]?.livekit_alias,
    );
  });
});

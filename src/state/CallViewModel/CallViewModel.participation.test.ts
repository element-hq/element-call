/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * `createCallViewModel$` over a real `CallParticipation` (the crate, through
 * the mock drivers) and mocked LiveKit connections: the Matrix side end to
 * end, from the user's join to the roster and back out.
 *
 * Real wasm, real timers — nothing here may use `vi.useFakeTimers`.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { BehaviorSubject } from "rxjs";
import { type Room as LivekitRoom } from "livekit-client";

import { MatrixRTCMode } from "../../config/ConfigOptions";
import { E2eeType } from "../../e2ee/e2eeType";
import { MockElementCallMatrixClientDriver } from "../../driver/MockElementCallMatrixClientDriver";
import {
  MOCK_LK_SERVICE_URL,
  MockRtcMatrixDriver,
  slotEvent,
  waitFor,
} from "../../driver/MockRtcMatrixDriver";
import { FfiStatus } from "../../matrix-rtc-sdk";
import { type RaisedHandInfo, type ReactionInfo } from "../../reactions";
import { MatrixRTCTransportMissingError } from "../../utils/errors";
import {
  MockConnection,
  mockConfig,
  mockLivekitRoom,
  mockLocalParticipant,
  mockMediaDevices,
  mockMuteStates,
  testScope,
} from "../../utils/test";
import { initMatrixRtcSdkForTests } from "../../utils/test-matrix-rtc";
import { constant } from "../Behavior";
import { CallParticipation } from "../rtc/CallParticipation";
import { joinParamsFromConfig, participationConfig } from "../rtc/joinParams";
import { type CallViewModel, createCallViewModel$ } from "./CallViewModel";

mockConfig({});

const session = {
  delayed_leave: { delay_ms: 15_000 },
  delegated_delayed_leave: { delay_ms: 3_600_000 },
  network_error_retry_ms: 1000,
  wait_for_key_rotation_ms: 50,
};

const peer = {
  userId: "@peer:example.org",
  deviceId: "PEERDEV",
  memberId: "m-peer",
};

function createEnvironment(driver: MockRtcMatrixDriver): {
  vm: CallViewModel;
  participation: CallParticipation;
  clientDriver: MockElementCallMatrixClientDriver;
} {
  const scope = testScope();
  const clientDriver = new MockElementCallMatrixClientDriver({
    userId: driver.userId,
    deviceId: driver.deviceId,
    roomId: driver.roomId,
    members: [
      {
        userId: driver.userId,
        displayName: "Me",
        avatarUrl: null,
        membership: "join",
      },
      {
        userId: peer.userId,
        displayName: "Peer",
        avatarUrl: null,
        membership: "join",
      },
    ],
  });
  const participation = new CallParticipation(
    scope,
    driver,
    driver.roomId,
    driver.userId,
    driver.deviceId,
    {
      config: participationConfig({
        mode: MatrixRTCMode.Matrix_2_0,
        manageMediaKeys: false,
        session,
      }),
    },
  );
  const livekitRoomFactory = (): LivekitRoom =>
    mockLivekitRoom({
      localParticipant: mockLocalParticipant({ identity: "" }),
      remoteParticipants: new Map(),
      disconnect: async () => Promise.resolve(),
      setE2EEEnabled: async () => Promise.resolve(),
    });
  const vm = createCallViewModel$(
    scope,
    participation,
    clientDriver,
    mockMediaDevices({}),
    mockMuteStates(),
    {
      encryptionSystem: { kind: E2eeType.NONE },
      autoLeaveWhenOthersLeft: false,
      livekitRoomFactory,
      connectionFactory: {
        createConnection(scope, transport, ownMembershipIdentity, logger, sfu) {
          return new MockConnection(
            {
              scope,
              transport,
              ownMembershipIdentity,
              existingSFUConfig: sfu,
              client: null,
              roomId: driver.roomId,
              livekitRoomFactory,
            },
            logger,
          );
        },
      },
      windowSize$: constant({ width: 1000, height: 800 }),
      joinParams: joinParamsFromConfig({
        session,
        delegateDelayedLeave: false,
      }),
    },
    new BehaviorSubject<Record<string, RaisedHandInfo>>({}),
    new BehaviorSubject<Record<string, ReactionInfo>>({}),
    constant({ processor: undefined, supported: false }),
  );
  return { vm, participation, clientDriver };
}

describe("createCallViewModel$ over a CallParticipation", () => {
  beforeAll(async () => {
    await initMatrixRtcSdkForTests();
  });

  it("joins through the crate, lists the members and leaves again", async () => {
    // Somebody already started the call: the slot is open.
    const driver = new MockRtcMatrixDriver({
      roomState: [slotEvent({ status: "open" })],
    });
    const { vm, participation } = createEnvironment(driver);
    expect(vm.participantCount$.value).toBe(0);
    expect(vm.connected$.value).toBe(false);

    vm.join();
    await waitFor("the crate to be connected", () =>
      FfiStatus.Connected.instanceOf(participation.status$.value),
    );
    // The crate discovered the transport and minted our token; the view
    // model holds a connection to it.
    await waitFor(
      "our connection",
      () => vm.allConnections$.value.getConnections().length === 1,
    );
    expect(
      vm.allConnections$.value.getConnections()[0].transport
        .livekit_service_url,
    ).toBe(MOCK_LK_SERVICE_URL);
    // Our own membership echoed back: we are a member with our device.
    await waitFor(
      "our own tile",
      () => vm.localMatrixLivekitMember$.value !== null,
    );
    expect(vm.localMatrixLivekitMember$.value?.membership$.value).toMatchObject(
      { userId: driver.userId, deviceId: driver.deviceId },
    );
    expect(vm.participantCount$.value).toBe(1);
    expect(vm.fatalError$.value).toBeNull();

    driver.peerJoins(peer);
    await waitFor(
      "the peer's tile",
      () => vm.remoteMatrixLivekitMembers$.value.length === 1,
    );
    const [remote] = vm.remoteMatrixLivekitMembers$.value;
    expect(remote.membership$.value).toMatchObject({
      userId: peer.userId,
      memberId: peer.memberId,
    });
    // Both publish on the same service: one connection carries both.
    expect(remote.connection$.value?.transport.livekit_service_url).toBe(
      MOCK_LK_SERVICE_URL,
    );
    expect(vm.participantCount$.value).toBe(2);

    vm.leave();
    await waitFor("the crate to be disconnected", () =>
      FfiStatus.Disconnected.instanceOf(participation.status$.value),
    );
    await waitFor(
      "our tile to go",
      () => vm.localMatrixLivekitMember$.value === null,
    );
    expect(vm.fatalError$.value).toBeNull();
  });

  it("shows the crate's join failure as the fatal error", async () => {
    // The homeserver advertises no transport and there is no fallback.
    const driver = new MockRtcMatrixDriver({
      roomState: [slotEvent({ status: "open" })],
      transports: [],
    });
    const { vm } = createEnvironment(driver);
    vm.join();
    await waitFor("the fatal error", () => vm.fatalError$.value !== null);
    expect(vm.fatalError$.value).toBeInstanceOf(MatrixRTCTransportMissingError);
  });
});

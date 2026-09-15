/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { beforeAll, describe, expect, it } from "vitest";

import { initMatrixRtcSdkForTests } from "../utils/test-matrix-rtc";
import {
  FfiElementCallCompat,
  FfiMatrixDriver,
  FfiMembershipState,
  FfiParticipationManager,
  FfiStatus,
  FfiTransportIntent,
  type FfiParticipationConfig,
} from "../matrix-rtc-sdk";
import {
  MOCK_LK_SERVICE_URL,
  MOCK_OWN_USER_ID,
  MOCK_SLOT_ID,
  MockRtcMatrixDriver,
  roomEncryptionEvent,
  slotEvent,
  waitFor,
} from "./MockRtcMatrixDriver";

const config: FfiParticipationConfig = {
  compat: FfiElementCallCompat.StickyEvents,
  manageMediaKeys: true,
  requireCrossSignedSender: false,
  useKeyDelayMs: 50n,
};

const joinParams = {
  applicationType: "m.call",
  intent: undefined,
  stickyDurationMs: 240_000n,
  keepAliveTimeoutMs: 15_000n,
  degradedLifetimeMs: undefined,
  delegateDelayedLeave: false,
};

const publish = (): FfiTransportIntent =>
  new FfiTransportIntent.Publish({
    transport: {
      transportType: "livekit",
      propertiesJson: JSON.stringify({
        livekit_service_url: MOCK_LK_SERVICE_URL,
      }),
    },
  });

function newManager(driver: MockRtcMatrixDriver): FfiParticipationManager {
  return new FfiParticipationManager(
    driver.roomId,
    MOCK_SLOT_ID,
    driver.userId,
    driver.deviceId,
    new FfiMatrixDriver(driver),
    config,
  );
}

describe("MockRtcMatrixDriver as the crate's driver", () => {
  beforeAll(async () => {
    await initMatrixRtcSdkForTests();
  });

  it("echoes our sticky join so our own membership reaches the roster", async () => {
    const driver = new MockRtcMatrixDriver({
      roomState: [slotEvent({ status: "open" })],
    });
    const manager = newManager(driver);
    await manager.join(publish(), joinParams);
    expect(FfiStatus.Connected.instanceOf(manager.status())).toBe(true);
    const sticky = driver.calls("stickyEvent");
    expect(sticky).toHaveLength(1);
    expect(sticky[0].eventType).toBe("org.matrix.msc4143.rtc.member");
    const me = manager
      .memberships()
      .find((m) => m.member.userId === MOCK_OWN_USER_ID);
    expect(me?.state).toBe(FfiMembershipState.Joined);
    expect(me?.connections).toEqual([MOCK_LK_SERVICE_URL]);
    expect(me?.transportIdentity).toBe(manager.ownTransportIdentity());
    // the token the mock minted is what the crate hands out
    expect(manager.connections()[0].connection.jwtToken).toBe(
      `jwt-for-${MOCK_LK_SERVICE_URL}`,
    );
    await manager.leave(undefined, undefined);
    manager.uniffiDestroy();
  });

  it("hosts peers that join, answer our key and leave", async () => {
    const driver = new MockRtcMatrixDriver({
      roomState: [
        roomEncryptionEvent(),
        slotEvent({ status: "open", encrypted: true }),
      ],
    });
    const manager = newManager(driver);
    const peer = driver.addPeer({
      userId: "@peer:example.org",
      deviceId: "PEERDEV",
      memberId: "m-peer",
    });
    await manager.join(
      new FfiTransportIntent.ReceiveOnly({ canSubscribe: ["livekit"] }),
      joinParams,
    );
    driver.peerJoins(peer);
    expect(manager.memberships().map((m) => m.member.userId)).toContain(
      peer.userId,
    );
    await waitFor("key exchange", () =>
      manager.keyMap().some((k) => k.memberId === peer.memberId),
    );
    // StickyEvents compat: our key went out in the deployed dialect
    expect(driver.calls("toDevice")[0].eventType).toBe(
      "io.element.call.encryption_keys",
    );
    driver.peerLeaves(peer);
    expect(
      manager.memberships().find((m) => m.member.memberId === peer.memberId)
        ?.state,
    ).toBe(FfiMembershipState.LeftWithKeys);
    await manager.leave(undefined, undefined);
    manager.uniffiDestroy();
  });

  it("reports homeserver connectivity into the crate", async () => {
    const driver = new MockRtcMatrixDriver({
      roomState: [slotEvent({ status: "open" })],
    });
    const manager = newManager(driver);
    expect(manager.isHomeserverConnected()).toBe(true);
    await manager.join(publish(), joinParams);
    driver.setHomeserverConnected(false);
    await waitFor("outage reported", () => !manager.isHomeserverConnected());
    await waitFor("impairment", () => {
      const status = manager.status();
      return (
        FfiStatus.Connected.instanceOf(status) &&
        status.inner.impairments[0]?.tag === "HomeserverUnreachable"
      );
    });
    driver.setHomeserverConnected(true);
    await waitFor("outage clears", () => {
      const status = manager.status();
      return (
        FfiStatus.Connected.instanceOf(status) &&
        status.inner.impairments.length === 0
      );
    });
    await manager.leave(undefined, undefined);
    manager.uniffiDestroy();
  });

  it("can refuse sticky and delayed events like an old homeserver", async () => {
    const driver = new MockRtcMatrixDriver({
      roomState: [slotEvent({ status: "open" })],
    });
    driver.refuseStickyEvents = true;
    const manager = newManager(driver);
    await expect(manager.join(publish(), joinParams)).rejects.toThrow();
    expect(FfiStatus.Disconnected.instanceOf(manager.status())).toBe(true);
    manager.uniffiDestroy();
  });
});

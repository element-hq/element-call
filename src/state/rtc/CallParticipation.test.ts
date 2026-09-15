/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { beforeAll, describe, expect, it } from "vitest";

import { MatrixRTCMode } from "../../config/ConfigOptions";
import {
  MOCK_LK_SERVICE_URL,
  MockRtcMatrixDriver,
  roomEncryptionEvent,
  slotEvent,
  waitFor,
} from "../../driver/MockRtcMatrixDriver";
import {
  FfiDisconnectCause,
  FfiElementCallCompat,
  FfiStatus,
  type FfiMediaKey,
} from "../../matrix-rtc-sdk";
import { initMatrixRtcSdkForTests } from "../../utils/test-matrix-rtc";
import { testScope } from "../../utils/test";
import { ObservableScope } from "../ObservableScope";
import { CallParticipation } from "./CallParticipation";
import { errorForStatus } from "./errors";
import {
  compatForMode,
  joinParamsFromConfig,
  participationConfig,
} from "./joinParams";
import { publishOnLivekit, receiveOnly } from "./transportIntent";
import {
  MatrixRTCTransportMissingError,
  NoOpenSlotError,
  StickyEventsRequiredError,
} from "../../utils/errors";

const session = {
  delayed_leave: { delay_ms: 15_000 },
  delegated_delayed_leave: { delay_ms: 3_600_000 },
  network_error_retry_ms: 1000,
  wait_for_key_rotation_ms: 50,
};

const joinParams = joinParamsFromConfig({
  session,
  delegateDelayedLeave: false,
});

function create(
  driver: MockRtcMatrixDriver,
  overrides: { manageMediaKeys?: boolean; transportFallbackUrl?: string } = {},
  scope = testScope(),
): CallParticipation {
  return new CallParticipation(
    scope,
    driver,
    driver.roomId,
    driver.userId,
    driver.deviceId,
    {
      config: participationConfig({
        mode: MatrixRTCMode.Matrix_2_0,
        manageMediaKeys: overrides.manageMediaKeys ?? true,
        session,
      }),
      transportFallbackUrl: overrides.transportFallbackUrl,
    },
  );
}

/** A room where nobody has started a call yet, and we may. */
const openSlot = { encrypted: false, canOpen: true };

const peer = {
  userId: "@peer:example.org",
  deviceId: "PEERDEV",
  memberId: "m-peer",
};

describe("CallParticipation", () => {
  beforeAll(async () => {
    await initMatrixRtcSdkForTests();
  });

  it("starts disconnected and follows a remote member in and out", async () => {
    // somebody already started the call: the slot is open
    const driver = new MockRtcMatrixDriver({
      roomState: [slotEvent({ status: "open" })],
    });
    const callParticipation = create(driver);
    expect(
      FfiStatus.Disconnected.instanceOf(callParticipation.status$.value),
    ).toBe(true);
    expect(callParticipation.memberships$.value.value).toEqual([]);

    driver.peerJoins(peer);
    // getters are fresh at once; the listener fires a tick later
    await waitFor(
      "peer listed",
      () => callParticipation.memberships$.value.value.length === 1,
    );
    const [membership] = callParticipation.memberships$.value.value;
    expect(membership.member.memberId).toBe(peer.memberId);
    expect(membership.connections).toEqual([MOCK_LK_SERVICE_URL]);
    expect(callParticipation.session$.value.memberCount).toBe(1);

    driver.peerLeaves(peer);
    await waitFor(
      "peer gone",
      () => callParticipation.memberships$.value.value.length === 0,
    );
  });

  it("joins publishing, exposes our identity before the echo and our membership after it", async () => {
    const driver = new MockRtcMatrixDriver();
    const callParticipation = create(driver);
    await callParticipation.join(publishOnLivekit(), joinParams, openSlot);

    expect(
      FfiStatus.Connected.instanceOf(callParticipation.status$.value),
    ).toBe(true);
    const ownMemberId = callParticipation.ownMemberId$.value;
    expect(ownMemberId).toBeTruthy();
    expect(callParticipation.ownTransportIdentity$.value).toBeTruthy();
    // nobody had started a call: we opened the slot before joining
    expect(callParticipation.session$.value.slotOpen).toBe(true);
    const [slot] = driver.calls("stateEvent");
    expect(slot.eventType).toBe("org.matrix.msc4143.rtc.slot");
    expect(slot.stateKey).toBe("m.call#ROOM");
    expect(slot.content).toEqual({
      status: "open",
      application: { type: "m.call" },
    });

    await waitFor(
      "own echo",
      () => callParticipation.ownMembership$.value !== null,
    );
    expect(callParticipation.ownMembership$.value?.member.memberId).toBe(
      ownMemberId,
    );
    expect(callParticipation.ownMembership$.value?.transportIdentity).toBe(
      callParticipation.ownTransportIdentity$.value,
    );
    expect(callParticipation.connections$.value).toHaveLength(1);
    expect(callParticipation.connections$.value[0].connection.serviceUrl).toBe(
      MOCK_LK_SERVICE_URL,
    );
    // discovery: the bare intent asked the homeserver
    expect(driver.calls("getRtcTransports")).toHaveLength(1);
    expect(driver.calls("getLivekitToken")[0].slotId).toBe("m.call#ROOM");

    await callParticipation.leave();
    const status = callParticipation.status$.value;
    expect(FfiStatus.Disconnected.instanceOf(status)).toBe(true);
    if (FfiStatus.Disconnected.instanceOf(status))
      expect(FfiDisconnectCause.LeftByHost.instanceOf(status.inner.cause)).toBe(
        true,
      );
    // ...and again: a manager can be reused, with a fresh member id
    await callParticipation.join(publishOnLivekit(), joinParams, openSlot);
    expect(callParticipation.ownMemberId$.value).not.toBe(ownMemberId);
    await callParticipation.leave();
  });

  it("does not open a slot that is already open, and refuses to join without the power to open one", async () => {
    const open = new MockRtcMatrixDriver({
      roomState: [slotEvent({ status: "open" })],
    });
    const p1 = create(open);
    await p1.join(receiveOnly(), joinParams, {
      encrypted: false,
      canOpen: false,
    });
    expect(open.calls("stateEvent")).toEqual([]);
    await p1.leave();

    const closed = new MockRtcMatrixDriver();
    const p2 = create(closed);
    await expect(
      p2.join(receiveOnly(), joinParams, { encrypted: false, canOpen: false }),
    ).rejects.toBeInstanceOf(NoOpenSlotError);
    expect(closed.calls("stateEvent")).toEqual([]);
    expect(closed.calls("stickyEvent")).toEqual([]);
    expect(FfiStatus.Disconnected.instanceOf(p2.status$.value)).toBe(true);

    // an encrypted room gets a slot that prescribes per-member keys
    const encryptedRoom = new MockRtcMatrixDriver({
      roomState: [roomEncryptionEvent()],
    });
    const p3 = create(encryptedRoom);
    await p3.join(receiveOnly(), joinParams, {
      encrypted: true,
      canOpen: true,
    });
    expect(encryptedRoom.calls("stateEvent")[0].content).toEqual({
      status: "open",
      application: { type: "m.call" },
      encryption: { type: "m.per_member" },
    });
    expect(p3.session$.value.encrypted).toBe(true);
    await p3.leave();
  });

  it("falls back to the configured transport when the homeserver has none or fails", async () => {
    const none = new MockRtcMatrixDriver({ transports: [] });
    const p1 = create(none, { transportFallbackUrl: "https://lk.config" });
    await p1.join(publishOnLivekit(), joinParams, openSlot);
    expect(none.calls("getLivekitToken")[0].url).toBe("https://lk.config");
    await p1.leave();

    const failing = new MockRtcMatrixDriver();
    failing.failTransportDiscovery = true;
    const p2 = create(failing, { transportFallbackUrl: "https://lk.config" });
    await p2.join(publishOnLivekit(), joinParams, openSlot);
    expect(failing.calls("getLivekitToken")[0].url).toBe("https://lk.config");
    await p2.leave();

    // a custom URL in the intent skips discovery altogether
    const custom = new MockRtcMatrixDriver();
    const p3 = create(custom);
    await p3.join(publishOnLivekit("https://lk.custom"), joinParams, openSlot);
    expect(custom.calls("getRtcTransports")).toHaveLength(0);
    expect(custom.calls("getLivekitToken")[0].url).toBe("https://lk.custom");
    await p3.leave();
  });

  it("streams key changes and filters members that left holding our key", async () => {
    const driver = new MockRtcMatrixDriver({
      roomState: [
        roomEncryptionEvent(),
        slotEvent({ status: "open", encrypted: true }),
      ],
    });
    const callParticipation = create(driver);
    const changes: FfiMediaKey[] = [];
    callParticipation.keyChanges$.subscribe((k) => changes.push(k));
    driver.addPeer(peer);
    await callParticipation.join(receiveOnly(), joinParams, openSlot);
    driver.peerJoins(peer);
    await waitFor("peer key", () =>
      callParticipation.keyMap$.value.some((k) => k.memberId === peer.memberId),
    );
    expect(changes.some((k) => k.memberId === peer.memberId)).toBe(true);
    driver.peerLeaves(peer);
    // the crate keeps a LeftWithKeys entry; the behavior does not
    await waitFor(
      "peer gone from memberships",
      () =>
        !callParticipation.memberships$.value.value.some(
          (m) => m.member.memberId === peer.memberId,
        ),
    );
    await callParticipation.leave();
  });

  it("does not exchange keys when the call manages none", async () => {
    const driver = new MockRtcMatrixDriver();
    const callParticipation = create(driver, { manageMediaKeys: false });
    driver.addPeer(peer);
    await callParticipation.join(receiveOnly(), joinParams, openSlot);
    driver.peerJoins(peer);
    await new Promise((r) => setTimeout(r, 50));
    expect(driver.calls("toDevice")).toEqual([]);
    await callParticipation.leave();
  });

  it("surfaces a lost homeserver as a critical impairment in the status", async () => {
    const driver = new MockRtcMatrixDriver();
    const callParticipation = create(driver);
    await callParticipation.join(receiveOnly(), joinParams, openSlot);
    driver.setHomeserverConnected(false);
    await waitFor("impairment in status$", () => {
      const status = callParticipation.status$.value;
      return (
        FfiStatus.Connected.instanceOf(status) &&
        status.inner.impairments[0]?.tag === "HomeserverUnreachable"
      );
    });
    driver.setHomeserverConnected(true);
    await waitFor("impairment cleared", () => {
      const status = callParticipation.status$.value;
      return (
        FfiStatus.Connected.instanceOf(status) &&
        status.inner.impairments.length === 0
      );
    });
    await callParticipation.leave();
  });

  it("leaves and destroys the manager when the scope ends", async () => {
    const driver = new MockRtcMatrixDriver();
    const scope = new ObservableScope();
    const callParticipation = create(driver, {}, scope);
    await callParticipation.join(receiveOnly(), joinParams, openSlot);
    scope.end();
    await waitFor(
      "leave sent",
      () =>
        driver
          .calls("stickyEvent")
          .some(
            (c) =>
              c.content.member === undefined ||
              c.content.msc4354_sticky_key !== undefined,
          ) && driver.calls("cancelDelayed").length === 1,
    );
    expect(callParticipation.debugSnapshot()).toBe("{}");
    await expect(
      callParticipation.join(receiveOnly(), joinParams, openSlot),
    ).rejects.toThrow("ended");
  });

  it("turns terminal causes into Element Call errors", async () => {
    const driver = new MockRtcMatrixDriver({ transports: [] });
    const callParticipation = create(driver);
    await expect(
      callParticipation.join(publishOnLivekit(), joinParams, openSlot),
    ).rejects.toThrow();
    expect(
      errorForStatus(callParticipation.status$.value, {
        domain: "example.org",
        stickyEventsSupported: true,
      }),
    ).toBeInstanceOf(MatrixRTCTransportMissingError);

    const noSticky = new MockRtcMatrixDriver();
    noSticky.refuseStickyEvents = true;
    const p2 = create(noSticky);
    await expect(
      p2.join(receiveOnly(), joinParams, openSlot),
    ).rejects.toThrow();
    expect(
      errorForStatus(p2.status$.value, {
        domain: "example.org",
        stickyEventsSupported: false,
      }),
    ).toBeInstanceOf(StickyEventsRequiredError);

    const fine = create(new MockRtcMatrixDriver());
    expect(
      errorForStatus(fine.status$.value, {
        domain: "example.org",
        stickyEventsSupported: true,
      }),
    ).toBeNull();
  });

  it("derives the crate's parameters from Element Call's config", () => {
    expect(compatForMode(MatrixRTCMode.Compatibility)).toBe(
      FfiElementCallCompat.StateEvents,
    );
    expect(compatForMode(MatrixRTCMode.Matrix_2_0)).toBe(
      FfiElementCallCompat.StickyEvents,
    );
    expect(joinParams).toEqual({
      applicationType: "m.call",
      intent: undefined,
      // js-sdk's 4 h default, capped at the sticky hour
      stickyDurationMs: 3_600_000n,
      keepAliveTimeoutMs: 15_000n,
      degradedLifetimeMs: undefined,
      delegateDelayedLeave: false,
    });
    expect(
      joinParamsFromConfig({
        session: { ...session, membership_event_expiry_ms: 60_000 },
        callIntent: "video",
        delegateDelayedLeave: true,
      }),
    ).toMatchObject({
      intent: "video",
      stickyDurationMs: 60_000n,
      delegateDelayedLeave: true,
    });
    expect(
      participationConfig({
        mode: MatrixRTCMode.Compatibility,
        manageMediaKeys: false,
        session,
      }),
    ).toEqual({
      compat: FfiElementCallCompat.StateEvents,
      manageMediaKeys: false,
      requireCrossSignedSender: false,
      useKeyDelayMs: 50n,
    });
  });
});

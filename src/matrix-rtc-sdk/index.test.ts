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
  FfiParticipationManager,
  FfiStatus,
  computeSessionsFromEvents,
  type FfiLivekitToken,
  type FfiLivekitTokenRequest,
  type FfiRtcTransport,
  type FfiSendEventResponse,
  type FfiToDeviceDelivery,
  type FfiToDeviceRecipient,
  type MatrixDriverCallback,
} from ".";

const ROOM_ID = "!room:example.org";

describe("matrix-rtc-sdk", () => {
  beforeAll(async () => {
    await initMatrixRtcSdkForTests();
  });

  it("computes a session from raw events without a manager", () => {
    const join = JSON.stringify({
      type: "m.rtc.member",
      sender: "@alice:example.org",
      event_id: "$1",
      room_id: ROOM_ID,
      origin_server_ts: Date.now(),
      msc4354_sticky: { duration_ms: 240_000 },
      content: {
        slot_id: "m.call#ROOM",
        msc4354_sticky_key: "m-1",
        member: { id: "m-1", membership: "join" },
        application: { type: "m.call" },
        transports: {
          published: [
            { type: "livekit", livekit_service_url: "https://lk.example.org" },
          ],
          can_subscribe: ["livekit"],
        },
      },
    });
    const [session] = computeSessionsFromEvents(
      [join],
      FfiElementCallCompat.StickyEvents,
    );
    expect(session.memberCount).toBe(1);
    expect(session.members[0].eventId).toBe("$1");
    expect(session.isActive).toBe(true);
  });

  it("constructs a manager over a TypeScript driver and starts disconnected", () => {
    const driver = new FfiMatrixDriver(new InertDriver());
    const manager = new FfiParticipationManager(
      ROOM_ID,
      "m.call#ROOM",
      "@me:example.org",
      "MYDEV",
      driver,
      {
        compat: FfiElementCallCompat.StickyEvents,
        manageMediaKeys: false,
        requireCrossSignedSender: false,
        useKeyDelayMs: 1000n,
      },
    );
    expect(FfiStatus.Disconnected.instanceOf(manager.status())).toBe(true);
    expect(manager.memberships()).toEqual([]);
    expect(manager.ownTransportIdentity()).toBeUndefined();
    manager.uniffiDestroy();
  });
});

/** A driver that answers every read with nothing and never sends. */
class InertDriver implements MatrixDriverCallback {
  public async sendStickyEvent(): Promise<FfiSendEventResponse> {
    return Promise.resolve({ eventId: "$sticky", delayId: undefined });
  }
  public async sendStateEvent(): Promise<FfiSendEventResponse> {
    return Promise.resolve({ eventId: "$state", delayId: undefined });
  }
  public async sendDelayedEvent(): Promise<string> {
    return Promise.resolve("delay");
  }
  public async sendDelayedStateEvent(): Promise<string> {
    return Promise.resolve("delay");
  }
  public async restartDelayedEvent(): Promise<void> {
    return Promise.resolve();
  }
  public async cancelDelayedEvent(): Promise<void> {
    return Promise.resolve();
  }
  public async delegateLivekitDelayedLeave(): Promise<void> {
    return Promise.resolve();
  }
  public async sendToDevice(
    recipients: FfiToDeviceRecipient[],
  ): Promise<FfiToDeviceDelivery[]> {
    return Promise.resolve(
      recipients.map((recipient) => ({ recipient, error: undefined })),
    );
  }
  public async getRtcTransports(): Promise<FfiRtcTransport[]> {
    return Promise.resolve([]);
  }
  public async getLivekitToken(
    request: FfiLivekitTokenRequest,
  ): Promise<FfiLivekitToken> {
    return Promise.resolve({ jwt: "jwt", url: request.url });
  }
  public async readEvents(): Promise<string[]> {
    return Promise.resolve([]);
  }
  public async readState(): Promise<string[]> {
    return Promise.resolve([]);
  }
  public subscribeRoomEvents(): void {}
  public subscribeToDeviceEvents(): void {}
  public subscribeStateUpdates(): void {}
  public subscribeConnectivity(): void {}
  public isHomeserverConnected(): boolean {
    return true;
  }
}

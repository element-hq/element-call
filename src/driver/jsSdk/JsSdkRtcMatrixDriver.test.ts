/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  ClientEvent,
  MatrixError,
  MatrixEvent,
  RoomStateEvent,
  RoomStickyEventsEvent,
  SyncState,
  UnsupportedStickyEventsEndpointError,
  UpdateDelayedEventAction,
} from "matrix-js-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initMatrixRtcSdkForTests } from "../../utils/test-matrix-rtc";
import {
  FfiEventOrigin,
  RtcError,
  type ConnectivitySinkLike,
  type RoomEventSinkLike,
  type StateUpdateSinkLike,
  type ToDeviceSinkLike,
} from "../../matrix-rtc-sdk";
import { JsSdkRtcMatrixDriver } from "./JsSdkRtcMatrixDriver";
import {
  LK,
  ME,
  MY_DEVICE,
  ROOM_ID,
  asClient,
  asRoom,
  fakeClient,
  fakeRoom,
  jsonResponse,
  openIdToken,
  type FakeClient,
  type FakeRoom,
} from "./jsSdkTestFakes";

const memberJson = JSON.stringify({
  id: "m-1",
  claimed_user_id: ME,
  claimed_device_id: MY_DEVICE,
});

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

describe("JsSdkRtcMatrixDriver", () => {
  beforeEach(async () => {
    // The bindings define the RtcError classes the driver throws.
    await initMatrixRtcSdkForTests();
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("over a full MatrixClient", () => {
    it("sends sticky, delayed and state events through the unstable APIs", async () => {
      const { client, driver } = fullClient();
      await expect(
        driver.sendStickyEvent(ROOM_ID, "m.rtc.member", '{"a":1}', 240_000n),
      ).resolves.toEqual({ eventId: "$sticky", delayId: undefined });
      expect(client._unstable_sendStickyEvent).toHaveBeenCalledWith(
        ROOM_ID,
        240_000,
        null,
        "m.rtc.member",
        { a: 1 },
      );

      await expect(
        driver.sendDelayedEvent(
          ROOM_ID,
          "m.rtc.member",
          "{}",
          15_000n,
          240_000n,
        ),
      ).resolves.toBe("delay-sticky");
      expect(client._unstable_sendStickyDelayedEvent).toHaveBeenCalledWith(
        ROOM_ID,
        240_000,
        { delay: 15_000 },
        null,
        "m.rtc.member",
        {},
      );
      await expect(
        driver.sendDelayedEvent(
          ROOM_ID,
          "m.rtc.member",
          "{}",
          15_000n,
          undefined,
        ),
      ).resolves.toBe("delay-plain");
      expect(client._unstable_sendDelayedEvent).toHaveBeenCalledWith(
        ROOM_ID,
        { delay: 15_000 },
        null,
        "m.rtc.member",
        {},
      );

      await driver.sendDelayedStateEvent(ROOM_ID, "m.x", "key", "{}", 5_000n);
      expect(client._unstable_sendDelayedStateEvent).toHaveBeenCalledWith(
        ROOM_ID,
        { delay: 5_000 },
        "m.x",
        {},
        "key",
      );
      await driver.sendStateEvent(ROOM_ID, "m.rtc.slot", "m.call#ROOM", "{}");
      expect(client.sendStateEvent).toHaveBeenCalledWith(
        ROOM_ID,
        "m.rtc.slot",
        {},
        "m.call#ROOM",
      );

      await driver.restartDelayedEvent(ROOM_ID, "d1");
      await driver.cancelDelayedEvent(ROOM_ID, "d1");
      expect(client._unstable_updateDelayedEvent).toHaveBeenNthCalledWith(
        1,
        "d1",
        UpdateDelayedEventAction.Restart,
      );
      expect(client._unstable_updateDelayedEvent).toHaveBeenNthCalledWith(
        2,
        "d1",
        UpdateDelayedEventAction.Cancel,
      );
    });

    it("maps js-sdk failures onto the crate's error family", async () => {
      const { client, driver } = fullClient();
      client._unstable_sendStickyEvent.mockRejectedValueOnce(
        new UnsupportedStickyEventsEndpointError("nope", "sendStickyEvent"),
      );
      await expect(
        driver.sendStickyEvent(ROOM_ID, "m.rtc.member", "{}", 1n),
      ).rejects.toSatisfy((e) => RtcError.Unsupported.instanceOf(e));

      client.sendStateEvent.mockRejectedValueOnce(
        new MatrixError({ errcode: "M_FORBIDDEN" }, 403),
      );
      await expect(
        driver.sendStateEvent(ROOM_ID, "m.rtc.slot", "k", "{}"),
      ).rejects.toSatisfy((e) => RtcError.Rejected.instanceOf(e));

      client.sendStateEvent.mockRejectedValueOnce(
        new MatrixError(
          { errcode: "M_LIMIT_EXCEEDED", retry_after_ms: 1500 },
          429,
        ),
      );
      await expect(
        driver.sendStateEvent(ROOM_ID, "m.rtc.slot", "k", "{}"),
      ).rejects.toSatisfy(
        (e) =>
          RtcError.RateLimited.instanceOf(e) && e.inner.retryAfterMs === 1500n,
      );
    });

    it("sends to-device messages Olm-encrypted per device", async () => {
      const { client, driver } = fullClient();
      const recipients = [{ userId: "@a:example.org", deviceId: "ADEV" }];
      await expect(
        driver.sendToDevice(recipients, "m.rtc.encryption_key", '{"k":1}'),
      ).resolves.toEqual([{ recipient: recipients[0], error: undefined }]);
      expect(client.encryptAndSendToDevice).toHaveBeenCalledWith(
        "m.rtc.encryption_key",
        recipients,
        { k: 1 },
      );
    });

    it("discovers transports through the client and answers in the crate's shape", async () => {
      const { client, driver } = fullClient();
      client._unstable_getRTCTransports.mockResolvedValue([
        { type: "livekit", livekit_service_url: LK },
      ]);
      await expect(driver.getRtcTransports()).resolves.toEqual([
        {
          transportType: "livekit",
          propertiesJson: JSON.stringify({ livekit_service_url: LK }),
        },
      ]);
    });

    it("exchanges an OpenID token for a LiveKit token, on either endpoint", async () => {
      const { driver } = fullClient();
      // a fresh Response per call: a body can be read once
      fetchMock.mockImplementation(async () =>
        Promise.resolve(jsonResponse({ jwt: "the-jwt", url: "wss://sfu" })),
      );
      await expect(
        driver.getLivekitToken({
          url: LK,
          roomId: ROOM_ID,
          slotId: "m.call#ROOM",
          memberJson,
          legacySfuGet: false,
        }),
      ).resolves.toEqual({ jwt: "the-jwt", url: "wss://sfu" });
      const [endpoint, init] = fetchMock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(endpoint).toBe(`${LK}/get_token`);
      expect(JSON.parse(init.body as string)).toEqual({
        room_id: ROOM_ID,
        slot_id: "m.call#ROOM",
        openid_token: openIdToken,
        member: JSON.parse(memberJson),
      });

      await driver.getLivekitToken({
        url: LK,
        roomId: ROOM_ID,
        slotId: "m.call#ROOM",
        memberJson,
        legacySfuGet: true,
      });
      const [legacyEndpoint, legacyInit] = fetchMock.mock
        .calls[1] as unknown as [string, RequestInit];
      expect(legacyEndpoint).toBe(`${LK}/sfu/get`);
      expect(JSON.parse(legacyInit.body as string)).toEqual({
        room: ROOM_ID,
        openid_token: openIdToken,
        device_id: MY_DEVICE,
      });

      fetchMock.mockResolvedValueOnce(new Response("gone", { status: 404 }));
      await expect(
        driver.getLivekitToken({
          url: LK,
          roomId: ROOM_ID,
          slotId: "m.call#ROOM",
          memberJson,
          legacySfuGet: false,
        }),
      ).rejects.toSatisfy((e) => RtcError.Unsupported.instanceOf(e));
    });

    it("offers both delegation primitives: the homeserver endpoint and the token endpoint", async () => {
      const { client, driver } = fullClient();
      client.http = { authedRequest: vi.fn(async () => Promise.resolve({})) };
      await driver.delegateDelayedLeaveViaHomeserver({
        sfuUrl: "wss://sfu.example.org",
        livekitServiceUrl: LK,
        roomId: ROOM_ID,
        slotId: "m.call#ROOM",
        memberJson,
        delayId: "delay-1",
        delayTimeoutMs: 3_600_000n,
      });
      expect(client.http.authedRequest).toHaveBeenCalledWith(
        "POST",
        "/rtc/livekit/delegate_delayed_leave",
        undefined,
        {
          url: "wss://sfu.example.org",
          room_id: ROOM_ID,
          slot_id: "m.call#ROOM",
          member: JSON.parse(memberJson),
          delay_id: "delay-1",
          delay_timeout: 3_600_000,
        },
        { prefix: "/_matrix/client/unstable/io.element.msc4195" },
      );

      fetchMock.mockImplementation(async () =>
        Promise.resolve(jsonResponse({ jwt: "discarded" })),
      );
      await driver.delegateDelayedLeaveViaTransport({
        livekitServiceUrl: LK,
        roomId: ROOM_ID,
        slotId: "m.call#ROOM",
        memberJson,
        delayId: "delay-1",
        delayTimeoutMs: 3_600_000n,
        legacySfuGet: false,
      });
      const [endpoint, init] = fetchMock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(endpoint).toBe(`${LK}/get_token`);
      expect(JSON.parse(init.body as string)).toMatchObject({
        delay_id: "delay-1",
        delay_timeout: 3_600_000,
        delay_cs_api_url: "https://hs.example.org",
      });
    });

    it("feeds sticky events and state updates into the crate's sinks with their origin", async () => {
      const { client, room, driver } = fullClient();
      const roomSink = sink();
      const stateSink = sink();
      driver.subscribeRoomEvents(roomSink as unknown as RoomEventSinkLike);
      driver.subscribeStateUpdates(stateSink as unknown as StateUpdateSinkLike);

      const sticky = new MatrixEvent({
        type: "m.rtc.member",
        sender: "@a:example.org",
        event_id: "$s1",
        room_id: ROOM_ID,
        origin_server_ts: 1,
        content: { slot_id: "m.call#ROOM" },
      });
      room.emit(RoomStickyEventsEvent.Update, [sticky], [], []);
      await vi.waitFor(() => {
        expect(roomSink.emit).toHaveBeenCalledTimes(1);
        const [json, origin] = roomSink.emit.mock.calls[0] as unknown as [
          string,
          FfiEventOrigin,
        ];
        expect(JSON.parse(json)).toMatchObject({
          type: "m.rtc.member",
          event_id: "$s1",
          content: { slot_id: "m.call#ROOM" },
        });
        // not encrypted on this fake: the origin says so honestly
        expect(FfiEventOrigin.Cleartext.instanceOf(origin)).toBe(true);
      });

      const slot = new MatrixEvent({
        type: "m.rtc.slot",
        sender: "@admin:example.org",
        event_id: "$slot",
        room_id: ROOM_ID,
        state_key: "m.call#ROOM",
        origin_server_ts: 2,
        content: { status: "open" },
      });
      client.emit(RoomStateEvent.Events, slot, null, null);
      expect(stateSink.emit).toHaveBeenCalledTimes(1);
      expect(
        JSON.parse(
          (stateSink.emit.mock.calls[0] as unknown as [string[]])[0][0],
        ),
      ).toMatchObject({ type: "m.rtc.slot", state_key: "m.call#ROOM" });

      // another room's state is not ours
      client.emit(
        RoomStateEvent.Events,
        new MatrixEvent({ ...slot.event, room_id: "!other:example.org" }),
        null,
        null,
      );
      expect(stateSink.emit).toHaveBeenCalledTimes(1);
    });

    it("reports to-device messages with their Olm sender device and cross-signing verdict", async () => {
      const { client, driver } = fullClient();
      const toDevice = sink();
      driver.subscribeToDeviceEvents(toDevice as unknown as ToDeviceSinkLike);
      client.emit(ClientEvent.ReceivedToDeviceMessage, {
        message: {
          type: "m.rtc.encryption_key",
          sender: "@a:example.org",
          content: { member_id: "m-a" },
        },
        encryptionInfo: {
          sender: "@a:example.org",
          senderDevice: "ADEV",
          senderCurve25519KeyBase64: "k",
        },
      });
      await vi.waitFor(() => expect(toDevice.emit).toHaveBeenCalledTimes(1));
      const [type, sender, json, origin, crossSigned] = toDevice.emit.mock
        .calls[0] as unknown as [
        string,
        string,
        string,
        FfiEventOrigin,
        boolean,
      ];
      expect(type).toBe("m.rtc.encryption_key");
      expect(sender).toBe("@a:example.org");
      expect(JSON.parse(json)).toEqual({ member_id: "m-a" });
      expect(senderDeviceOf(origin)).toBe("ADEV");
      expect(crossSigned).toBe(true);
    });

    it("reports homeserver connectivity from the sync state", () => {
      const { client, driver } = fullClient();
      expect(driver.isHomeserverConnected()).toBe(true);
      const connectivity = sink();
      driver.subscribeConnectivity(
        connectivity as unknown as ConnectivitySinkLike,
      );
      client.getSyncState.mockReturnValue(SyncState.Error);
      client.emit(ClientEvent.Sync, SyncState.Error, SyncState.Syncing);
      expect(connectivity.emit).toHaveBeenCalledWith(false);
      expect(driver.isHomeserverConnected()).toBe(false);
      client.getSyncState.mockReturnValue(SyncState.Syncing);
      client.emit(ClientEvent.Sync, SyncState.Syncing, SyncState.Error);
      expect(connectivity.emit).toHaveBeenLastCalledWith(true);
    });
  });

  describe("over a RoomWidgetClient", () => {
    it("listens for the legacy to-device event and reports the claimed device", async () => {
      const { client, driver } = widgetClient();
      const toDevice = sink();
      driver.subscribeToDeviceEvents(toDevice as unknown as ToDeviceSinkLike);
      const event = new MatrixEvent({
        type: "io.element.call.encryption_keys",
        sender: "@a:example.org",
        content: { member: { id: "m-a", claimed_device_id: "ADEV" } },
      });
      event.makeEncrypted("m.room.encrypted", {}, "", "");
      client.emit(ClientEvent.ToDeviceEvent, event);
      await vi.waitFor(() => expect(toDevice.emit).toHaveBeenCalledTimes(1));
      const [, , , origin, crossSigned] = toDevice.emit.mock
        .calls[0] as unknown as [
        string,
        string,
        string,
        FfiEventOrigin,
        boolean | undefined,
      ];
      expect(senderDeviceOf(origin)).toBe("ADEV");
      expect(crossSigned).toBeUndefined();
    });

    it("cannot delegate through the homeserver, so the crate falls back to the service", async () => {
      const { driver } = widgetClient();
      await expect(
        driver.delegateDelayedLeaveViaHomeserver({
          sfuUrl: "wss://sfu.example.org",
          livekitServiceUrl: LK,
          roomId: ROOM_ID,
          slotId: "m.call#ROOM",
          memberJson,
          delayId: "delay-1",
          delayTimeoutMs: 3_600_000n,
        }),
      ).rejects.toSatisfy((e) => RtcError.Unsupported.instanceOf(e));
    });

    it("treats member events in an encrypted room as encrypted by the claimed device", async () => {
      const { room, driver } = widgetClient();
      const roomSink = sink();
      driver.subscribeRoomEvents(roomSink as unknown as RoomEventSinkLike);
      room.emit(
        RoomStickyEventsEvent.Update,
        [
          new MatrixEvent({
            type: "m.rtc.member",
            sender: "@a:example.org",
            event_id: "$s1",
            room_id: ROOM_ID,
            origin_server_ts: 1,
            content: { slot_id: "m.call#ROOM", member: { device_id: "ADEV" } },
          }),
        ],
        [],
        [],
      );
      await vi.waitFor(() => expect(roomSink.emit).toHaveBeenCalledTimes(1));
      const origin = (
        roomSink.emit.mock.calls[0] as unknown as [string, FfiEventOrigin]
      )[1];
      expect(senderDeviceOf(origin)).toBe("ADEV");
    });
  });
});

function fullClient(): {
  client: FakeClient;
  room: FakeRoom;
  driver: JsSdkRtcMatrixDriver;
} {
  const client = fakeClient(false);
  const room = fakeRoom();
  return {
    client,
    room,
    driver: new JsSdkRtcMatrixDriver(asClient(client), asRoom(room)),
  };
}

function widgetClient(): {
  client: FakeClient;
  room: FakeRoom;
  driver: JsSdkRtcMatrixDriver;
} {
  const client = fakeClient(true);
  const room = fakeRoom();
  return {
    client,
    room,
    driver: new JsSdkRtcMatrixDriver(asClient(client), asRoom(room)),
  };
}

type SinkEmit = ReturnType<typeof vi.fn<(...args: unknown[]) => boolean>>;

function sink(): { emit: SinkEmit } {
  return { emit: vi.fn<(...args: unknown[]) => boolean>(() => true) };
}

/** The sender device an origin carries, if it is an encrypted one. */
function senderDeviceOf(origin: FfiEventOrigin): string | undefined {
  return FfiEventOrigin.Encrypted.instanceOf(origin)
    ? origin.inner.senderDeviceId
    : undefined;
}

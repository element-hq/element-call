/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, vi, it, beforeEach } from "vitest";
import { createRoomWidgetClient, EventType } from "matrix-js-sdk";

import { getUrlParams } from "./UrlParams";
import { initializeWidget, widget } from "./widget";
import { Config } from "./config/Config";
import { ElementCallReactionEventType } from "./reactions";

vi.mock("matrix-js-sdk", { spy: true });
const createRoomWidgetClientSpy = vi.mocked(createRoomWidgetClient);

vi.mock("./config/Config", () => ({
  Config: {
    init: vi.fn().mockImplementation(async () => Promise.resolve()),
  },
}));
const configInitSpy = vi.mocked(Config.init);

vi.mock("./UrlParams", () => ({
  getUrlParams: vi.fn(() => ({
    widgetId: "id",
    parentUrl: "http://parentUrl",
    roomId: "room",
    userId: "myYser",
    deviceId: "AAAAA",
    baseUrl: "http://baseUrl",
    e2eEnabled: true,
  })),
}));

beforeEach(() => {
  createRoomWidgetClientSpy.mockClear();
});

describe("widget", () => {
  it("should create an embedded client with the correct params", () => {
    initializeWidget("ANYRTCAPP");

    expect(getUrlParams()).toStrictEqual({
      widgetId: "id",
      parentUrl: "http://parentUrl",
      roomId: "room",
      userId: "myYser",
      deviceId: "AAAAA",
      baseUrl: "http://baseUrl",
      e2eEnabled: true,
    });
    expect(widget).toBeDefined();
    expect(configInitSpy).toHaveBeenCalled();
    const sendEvent = [
      EventType.CallNotify, // Sent as a deprecated fallback
      EventType.RTCNotification,
    ];
    const sendRecvEvent = [
      "org.matrix.rageshake_request",
      EventType.CallEncryptionKeysPrefix,
      EventType.Reaction,
      EventType.RoomRedaction,
      ElementCallReactionEventType,
      EventType.RTCDecline,
      EventType.RTCMembership,
    ];

    const sendState = [
      { eventType: "org.matrix.msc3401.call.member", stateKey: "myYser" }, // Legacy call membership events
      {
        eventType: "org.matrix.msc3401.call.member",
        stateKey: `_myYser_AAAAA_ANYRTCAPP`,
      }, // Session membership events
      {
        eventType: "org.matrix.msc3401.call.member",
        stateKey: `myYser_AAAAA_ANYRTCAPP`,
      }, // The above with no leading underscore, for room versions whose auth rules allow it
    ];
    const receiveState = [
      { eventType: EventType.RoomCreate },
      { eventType: EventType.RoomName },
      { eventType: EventType.RoomMember },
      { eventType: EventType.RoomEncryption },
      { eventType: EventType.GroupCallMemberPrefix },
    ];

    const sendRecvToDevice = [
      EventType.CallInvite,
      EventType.CallCandidates,
      EventType.CallAnswer,
      EventType.CallHangup,
      EventType.CallReject,
      EventType.CallSelectAnswer,
      EventType.CallNegotiate,
      EventType.CallSDPStreamMetadataChanged,
      EventType.CallSDPStreamMetadataChangedPrefix,
      EventType.CallReplaces,
      EventType.CallEncryptionKeysPrefix,
    ];

    expect(createRoomWidgetClientSpy.mock.calls[0][1]).toStrictEqual({
      sendEvent: [...sendEvent, ...sendRecvEvent],
      receiveEvent: sendRecvEvent,
      sendState,
      receiveState,
      sendToDevice: sendRecvToDevice,
      receiveToDevice: sendRecvToDevice,
      turnServers: false,
      sendDelayedEvents: true,
      updateDelayedEvents: true,
      sendSticky: true,
      receiveSticky: true,
    });

    expect(createRoomWidgetClientSpy.mock.calls[0][2]).toStrictEqual("room");
    expect(createRoomWidgetClientSpy.mock.calls[0][3]).toStrictEqual({
      baseUrl: "http://baseUrl",
      userId: "myYser",
      deviceId: "AAAAA",
      timelineSupport: true,
      useE2eForGroupCall: true,
      fallbackICEServerAllowed: undefined,
      store: expect.any(Object),
      cryptoStore: expect.any(Object),
      idBaseUrl: undefined,
      scheduler: expect.any(Object),
    });
    expect(createRoomWidgetClientSpy.mock.calls[0][4]).toStrictEqual(false);
  });

  it("should request send message permission if requested", () => {
    initializeWidget("ANYRTCAPP", true);
    expect(createRoomWidgetClientSpy).toHaveBeenLastCalledWith(
      expect.anything(),
      // capabilities
      expect.objectContaining({
        sendEvent: expect.arrayContaining(["m.room.message"]),
      }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("should not request send message permission when not requested", () => {
    initializeWidget("", false);
    expect(createRoomWidgetClientSpy).toHaveBeenLastCalledWith(
      expect.anything(),
      // capabilities
      expect.objectContaining({
        sendEvent: expect.not.arrayContaining(["m.room.message"]),
      }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });
});

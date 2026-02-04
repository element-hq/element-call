/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { beforeAll, describe, expect, vi, it } from "vitest";
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

initializeWidget();
describe("widget", () => {
  beforeAll(() => {});

  it("should create an embedded client with the correct params", () => {
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
      "org.matrix.msc4075.call.notify", // Sent as a deprecated fallback
      "org.matrix.msc4075.rtc.notification",
    ];
    const sendRecvEvent = [
      "org.matrix.rageshake_request",
      "io.element.call.encryption_keys",
      "m.reaction",
      "m.room.redaction",
      "io.element.call.reaction",
      "org.matrix.msc4310.rtc.decline",
      "org.matrix.msc4143.rtc.member",
    ];

    const sendState = [
      "myYser", // Legacy call membership events
      `_myYser_AAAAA_m.call`, // Session membership events
      `myYser_AAAAA_m.call`, // The above with no leading underscore, for room versions whose auth rules allow it
    ].map((stateKey) => ({
      eventType: EventType.GroupCallMemberPrefix,
      stateKey,
    }));
    const receiveState = [
      { eventType: "m.room.create" },
      { eventType: "m.room.name" },
      { eventType: "m.room.member" },
      { eventType: "m.room.encryption" },
      { eventType: "org.matrix.msc3401.call.member" },
    ];

    const sendRecvToDevice = ["io.element.call.encryption_keys"];

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
});

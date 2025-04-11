/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixRTCSession } from "matrix-js-sdk/lib/matrixrtc";
import { expect, onTestFinished, test, vi } from "vitest";
import { AutoDiscovery } from "matrix-js-sdk/lib/autodiscovery";
import EventEmitter from "events";

import { enterRTCSession, leaveRTCSession } from "../src/rtcSessionHelpers";
import { mockConfig } from "./utils/test";
import { ElementWidgetActions, widget } from "./widget";
import { ErrorCode } from "./utils/errors.ts";

const getUrlParams = vi.hoisted(() => vi.fn(() => ({})));
vi.mock("./UrlParams", () => ({ getUrlParams }));

const actualWidget = await vi.hoisted(async () => vi.importActual("./widget"));
vi.mock("./widget", () => ({
  ...actualWidget,
  widget: {
    api: {
      setAlwaysOnScreen: (): void => {},
      transport: { send: vi.fn(), reply: vi.fn(), stop: vi.fn() },
    },
    lazyActions: new EventEmitter(),
  },
}));

test("It joins the correct Session", async () => {
  const focusFromOlderMembership = {
    type: "livekit",
    livekit_service_url: "http://my-oldest-member-service-url.com",
    livekit_alias: "my-oldest-member-service-alias",
  };

  const focusConfigFromWellKnown = {
    type: "livekit",
    livekit_service_url: "http://my-well-known-service-url.com",
  };
  const focusConfigFromWellKnown2 = {
    type: "livekit",
    livekit_service_url: "http://my-well-known-service-url2.com",
  };
  const clientWellKnown = {
    "org.matrix.msc4143.rtc_foci": [
      focusConfigFromWellKnown,
      focusConfigFromWellKnown2,
    ],
  };

  mockConfig({
    livekit: { livekit_service_url: "http://my-default-service-url.com" },
  });

  vi.spyOn(AutoDiscovery, "getRawClientConfig").mockImplementation(
    async (domain) => {
      if (domain === "example.org") {
        return Promise.resolve(clientWellKnown);
      }
      return Promise.resolve({});
    },
  );

  const mockedSession = vi.mocked({
    room: {
      roomId: "roomId",
      client: {
        getDomain: vi.fn().mockReturnValue("example.org"),
      },
    },
    memberships: [],
    getFocusInUse: vi.fn().mockReturnValue(focusFromOlderMembership),
    getOldestMembership: vi.fn().mockReturnValue({
      getPreferredFoci: vi.fn().mockReturnValue([focusFromOlderMembership]),
    }),
    joinRoomSession: vi.fn(),
  }) as unknown as MatrixRTCSession;
  await enterRTCSession(mockedSession, false);

  expect(mockedSession.joinRoomSession).toHaveBeenLastCalledWith(
    [
      {
        livekit_alias: "my-oldest-member-service-alias",
        livekit_service_url: "http://my-oldest-member-service-url.com",
        type: "livekit",
      },
      {
        livekit_alias: "roomId",
        livekit_service_url: "http://my-well-known-service-url.com",
        type: "livekit",
      },
      {
        livekit_alias: "roomId",
        livekit_service_url: "http://my-well-known-service-url2.com",
        type: "livekit",
      },
      {
        livekit_alias: "roomId",
        livekit_service_url: "http://my-default-service-url.com",
        type: "livekit",
      },
    ],
    {
      focus_selection: "oldest_membership",
      type: "livekit",
    },
    {
      manageMediaKeys: false,
      useLegacyMemberEvents: false,
      useNewMembershipManager: true,
      useExperimentalToDeviceTransport: false,
    },
  );
});

async function testLeaveRTCSession(
  cause: "user" | "error",
  expectClose: boolean,
): Promise<void> {
  vi.clearAllMocks();
  const session = { leaveRoomSession: vi.fn() } as unknown as MatrixRTCSession;
  await leaveRTCSession(session, cause);
  expect(session.leaveRoomSession).toHaveBeenCalled();
  expect(widget!.api.transport.send).toHaveBeenCalledWith(
    ElementWidgetActions.HangupCall,
    expect.anything(),
  );
  if (expectClose) {
    expect(widget!.api.transport.send).toHaveBeenCalledWith(
      ElementWidgetActions.Close,
      expect.anything(),
    );
    expect(widget!.api.transport.stop).toHaveBeenCalled();
  } else {
    expect(widget!.api.transport.send).not.toHaveBeenCalledWith(
      ElementWidgetActions.Close,
      expect.anything(),
    );
    expect(widget!.api.transport.stop).not.toHaveBeenCalled();
  }
}

test("leaveRTCSession closes the widget on a normal hangup", async () => {
  await testLeaveRTCSession("user", true);
});

test("leaveRTCSession doesn't close the widget on a fatal error", async () => {
  await testLeaveRTCSession("error", false);
});

test("leaveRTCSession doesn't close the widget when returning to lobby", async () => {
  getUrlParams.mockReturnValue({ returnToLobby: true });
  onTestFinished(() => void getUrlParams.mockReset());
  await testLeaveRTCSession("user", false);
});

test("It fails with configuration error if no live kit url config is set in fallback", async () => {
  mockConfig({});
  vi.spyOn(AutoDiscovery, "getRawClientConfig").mockResolvedValue({});

  const mockedSession = vi.mocked({
    room: {
      roomId: "roomId",
      client: {
        getDomain: vi.fn().mockReturnValue("example.org"),
      },
    },
    memberships: [],
    getFocusInUse: vi.fn(),
    joinRoomSession: vi.fn(),
  }) as unknown as MatrixRTCSession;

  await expect(enterRTCSession(mockedSession, false)).rejects.toThrowError(
    expect.objectContaining({ code: ErrorCode.MISSING_MATRIX_RTC_FOCUS }),
  );
});

test("It should not fail with configuration error if homeserver config has livekit url but not fallback", async () => {
  mockConfig({});
  vi.spyOn(AutoDiscovery, "getRawClientConfig").mockResolvedValue({
    "org.matrix.msc4143.rtc_foci": [
      {
        type: "livekit",
        livekit_service_url: "http://my-well-known-service-url.com",
      },
    ],
  });

  const mockedSession = vi.mocked({
    room: {
      roomId: "roomId",
      client: {
        getDomain: vi.fn().mockReturnValue("example.org"),
      },
    },
    memberships: [],
    getFocusInUse: vi.fn(),
    joinRoomSession: vi.fn(),
  }) as unknown as MatrixRTCSession;

  await enterRTCSession(mockedSession, false);
});

/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixRTCSession } from "matrix-js-sdk/lib/matrixrtc";
import { expect, test, vi } from "vitest";
import { AutoDiscovery } from "matrix-js-sdk/lib/autodiscovery";
import EventEmitter from "events";

import { enterRTCSession } from "../src/rtcSessionHelpers";
import { mockConfig } from "./utils/test";

const USE_MUTI_SFU = false;
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
        getOpenIdToken: vi.fn().mockResolvedValue({
          access_token: "ACCCESS_TOKEN",
          token_type: "Bearer",
          matrix_server_name: "localhost",
          expires_in: 10000,
        }),
      },
    },
    memberships: [],
    getFocusInUse: vi.fn().mockReturnValue(focusFromOlderMembership),
    getOldestMembership: vi.fn().mockReturnValue({
      getPreferredFoci: vi.fn().mockReturnValue([focusFromOlderMembership]),
    }),
    joinRoomSession: vi.fn(),
  }) as unknown as MatrixRTCSession;

  await enterRTCSession(
    mockedSession,
    {
      livekit_alias: "roomId",
      livekit_service_url: "http://my-well-known-service-url.com",
      type: "livekit",
    },
    {
      encryptMedia: true,
      useMultiSfu: USE_MUTI_SFU,
      preferStickyEvents: false,
    },
  );

  expect(mockedSession.joinRoomSession).toHaveBeenLastCalledWith(
    [
      {
        livekit_alias: "roomId",
        livekit_service_url: "http://my-well-known-service-url.com",
        type: "livekit",
      },
    ],
    undefined,
    expect.objectContaining({
      manageMediaKeys: true,
      useLegacyMemberEvents: false,
    }),
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
        getOpenIdToken: vi.fn().mockResolvedValue({
          access_token: "ACCCESS_TOKEN",
          token_type: "Bearer",
          matrix_server_name: "localhost",
          expires_in: 10000,
        }),
      },
    },
    memberships: [],
    getFocusInUse: vi.fn(),
    joinRoomSession: vi.fn(),
  }) as unknown as MatrixRTCSession;

  await enterRTCSession(
    mockedSession,
    {
      livekit_alias: "roomId",
      livekit_service_url: "http://my-well-known-service-url.com",
      type: "livekit",
    },
    {
      encryptMedia: true,
      useMultiSfu: USE_MUTI_SFU,
      preferStickyEvents: false,
    },
  );
});

/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import {
  getRoomIdentifierFromUrl,
  getUrlParams,
  HeaderStyle,
} from "../src/UrlParams";

const ROOM_NAME = "roomNameHere";
const ROOM_ID = "!d45f138fsd";
const ORIGIN = "https://call.element.io";
const HOMESERVER = "localhost";

describe("UrlParams", () => {
  describe("handles URL with /room/", () => {
    it("and nothing else", () => {
      expect(
        getRoomIdentifierFromUrl(`/room/${ROOM_NAME}`, "", "").roomAlias,
      ).toBe(`#${ROOM_NAME}:${HOMESERVER}`);
    });

    it("and #", () => {
      expect(
        getRoomIdentifierFromUrl("", `${ORIGIN}/room/`, `#${ROOM_NAME}`)
          .roomAlias,
      ).toBe(`#${ROOM_NAME}:${HOMESERVER}`);
    });

    it("and # and server part", () => {
      expect(
        getRoomIdentifierFromUrl("", `/room/`, `#${ROOM_NAME}:${HOMESERVER}`)
          .roomAlias,
      ).toBe(`#${ROOM_NAME}:${HOMESERVER}`);
    });

    it("and server part", () => {
      expect(
        getRoomIdentifierFromUrl(`/room/${ROOM_NAME}:${HOMESERVER}`, "", "")
          .roomAlias,
      ).toBe(`#${ROOM_NAME}:${HOMESERVER}`);
    });
  });

  describe("handles URL without /room/", () => {
    it("and nothing else", () => {
      expect(getRoomIdentifierFromUrl(`/${ROOM_NAME}`, "", "").roomAlias).toBe(
        `#${ROOM_NAME}:${HOMESERVER}`,
      );
    });

    it("and with #", () => {
      expect(getRoomIdentifierFromUrl("", "", `#${ROOM_NAME}`).roomAlias).toBe(
        `#${ROOM_NAME}:${HOMESERVER}`,
      );
    });

    it("and with # and server part", () => {
      expect(
        getRoomIdentifierFromUrl("", "", `#${ROOM_NAME}:${HOMESERVER}`)
          .roomAlias,
      ).toBe(`#${ROOM_NAME}:${HOMESERVER}`);
    });

    it("and with server part", () => {
      expect(
        getRoomIdentifierFromUrl(`/${ROOM_NAME}:${HOMESERVER}`, "", "")
          .roomAlias,
      ).toBe(`#${ROOM_NAME}:${HOMESERVER}`);
    });
  });

  describe("handles search params", () => {
    it("(roomId)", () => {
      expect(
        getRoomIdentifierFromUrl("", `?roomId=${ROOM_ID}`, "").roomId,
      ).toBe(ROOM_ID);
    });
    it("(roomId with unprintable characters)", () => {
      const invisibleChar = "\u2066";
      expect(
        getRoomIdentifierFromUrl(
          "",
          `?roomId=${invisibleChar}${ROOM_ID}${invisibleChar}`,
          "",
        ).roomId,
      ).toBe(ROOM_ID);
    });
  });

  it("ignores room alias", () => {
    expect(
      getRoomIdentifierFromUrl("", `/room/${ROOM_NAME}:${HOMESERVER}`, "")
        .roomAlias,
    ).toBeFalsy();
  });

  describe("preload", () => {
    it("defaults to false", () => {
      expect(getUrlParams().preload).toBe(false);
    });

    it("ignored in SPA mode", () => {
      expect(getUrlParams("?preload=true").preload).toBe(false);
    });

    it("respected in widget mode", () => {
      expect(
        getUrlParams(
          "?preload=true&widgetId=12345&parentUrl=https%3A%2F%2Flocalhost%2Ffoo",
        ).preload,
      ).toBe(true);
    });
  });

  describe("returnToLobby", () => {
    it("is false in SPA mode", () => {
      expect(getUrlParams("?returnToLobby=true").returnToLobby).toBe(false);
    });

    it("defaults to false in widget mode", () => {
      expect(
        getUrlParams("?widgetId=12345&parentUrl=https%3A%2F%2Flocalhost%2Ffoo")
          .returnToLobby,
      ).toBe(false);
    });

    it("respected in widget mode", () => {
      expect(
        getUrlParams(
          "?returnToLobby=true&widgetId=12345&parentUrl=https%3A%2F%2Flocalhost%2Ffoo",
        ).returnToLobby,
      ).toBe(true);
    });
  });

  describe("userId", () => {
    it("is ignored in SPA mode", () => {
      expect(getUrlParams("?userId=asd").userId).toBe(null);
    });

    it("is parsed in widget mode", () => {
      expect(
        getUrlParams(
          "?userId=asd&widgetId=12345&parentUrl=https%3A%2F%2Flocalhost%2Ffoo",
        ).userId,
      ).toBe("asd");
    });
  });

  describe("deviceId", () => {
    it("is ignored in SPA mode", () => {
      expect(getUrlParams("?deviceId=asd").deviceId).toBe(null);
    });

    it("is parsed in widget mode", () => {
      expect(
        getUrlParams(
          "?deviceId=asd&widgetId=12345&parentUrl=https%3A%2F%2Flocalhost%2Ffoo",
        ).deviceId,
      ).toBe("asd");
    });
  });

  describe("baseUrl", () => {
    it("is ignored in SPA mode", () => {
      expect(getUrlParams("?baseUrl=asd").baseUrl).toBe(null);
    });

    it("is parsed in widget mode", () => {
      expect(
        getUrlParams(
          "?baseUrl=asd&widgetId=12345&parentUrl=https%3A%2F%2Flocalhost%2Ffoo",
        ).baseUrl,
      ).toBe("asd");
    });
  });

  describe("viaServers", () => {
    it("is ignored in widget mode", () => {
      expect(
        getUrlParams(
          "?viaServers=asd&widgetId=12345&parentUrl=https%3A%2F%2Flocalhost%2Ffoo",
        ).viaServers,
      ).toBe(null);
    });

    it("is parsed in SPA mode", () => {
      expect(getUrlParams("?viaServers=asd").viaServers).toBe("asd");
    });
  });

  describe("homeserver", () => {
    it("is ignored in widget mode", () => {
      expect(
        getUrlParams(
          "?homeserver=asd&widgetId=12345&parentUrl=https%3A%2F%2Flocalhost%2Ffoo",
        ).homeserver,
      ).toBe(null);
    });

    it("is parsed in SPA mode", () => {
      expect(getUrlParams("?homeserver=asd").homeserver).toBe("asd");
    });
  });

  describe("intent", () => {
    const noIntentDefaults = {
      confineToRoom: false,
      appPrompt: true,
      preload: false,
      header: HeaderStyle.Standard,
      showControls: true,
      hideScreensharing: false,
      allowIceFallback: false,
      perParticipantE2EE: false,
      controlledAudioDevices: false,
      skipLobby: false,
      returnToLobby: false,
      sendNotificationType: undefined,
    };
    const startNewCallDefaults = (platform: string): object => ({
      confineToRoom: true,
      appPrompt: false,
      preload: true,
      header: platform === "desktop" ? HeaderStyle.None : HeaderStyle.AppBar,
      showControls: true,
      hideScreensharing: false,
      allowIceFallback: true,
      perParticipantE2EE: true,
      controlledAudioDevices: platform === "desktop" ? false : true,
      skipLobby: true,
      returnToLobby: false,
      sendNotificationType: "notification",
    });
    const joinExistingCallDefaults = (platform: string): object => ({
      confineToRoom: true,
      appPrompt: false,
      preload: true,
      header: platform === "desktop" ? HeaderStyle.None : HeaderStyle.AppBar,
      showControls: true,
      hideScreensharing: false,
      allowIceFallback: true,
      perParticipantE2EE: true,
      controlledAudioDevices: platform === "desktop" ? false : true,
      skipLobby: false,
      returnToLobby: false,
      sendNotificationType: "notification",
    });
    it("use no-intent-defaults with unknown intent", () => {
      expect(getUrlParams()).toMatchObject(noIntentDefaults);
    });

    it("ignores intent if it is not a valid value", () => {
      expect(getUrlParams("?intent=foo")).toMatchObject(noIntentDefaults);
    });

    it("accepts start_call", () => {
      expect(
        getUrlParams("?intent=start_call&widgetId=1234&parentUrl=parent.org"),
      ).toMatchObject(startNewCallDefaults("desktop"));
    });

    it("accepts join_existing", () => {
      expect(
        getUrlParams(
          "?intent=join_existing&widgetId=1234&parentUrl=parent.org",
        ),
      ).toMatchObject(joinExistingCallDefaults("desktop"));
    });
  });

  describe("skipLobby", () => {
    it("defaults to false", () => {
      expect(getUrlParams().skipLobby).toBe(false);
    });

    it("defaults to false if intent is start_call in SPA mode", () => {
      expect(getUrlParams("?intent=start_call").skipLobby).toBe(false);
    });

    it("defaults to true if intent is start_call in widget mode", () => {
      expect(
        getUrlParams(
          "?intent=start_call&widgetId=12345&parentUrl=https%3A%2F%2Flocalhost%2Ffoo",
        ).skipLobby,
      ).toBe(true);
    });

    it("default to false if intent is join_existing", () => {
      expect(getUrlParams("?intent=join_existing").skipLobby).toBe(false);
    });
  });
  describe("header", () => {
    it("uses header if provided", () => {
      expect(getUrlParams("?header=app_bar&hideHeader=true").header).toBe(
        "app_bar",
      );
      expect(getUrlParams("?header=none&hideHeader=false").header).toBe("none");
    });
  });
});

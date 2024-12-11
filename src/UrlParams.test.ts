/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { getRoomIdentifierFromUrl, getUrlParams } from "../src/UrlParams";

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
    it("is true in SPA mode", () => {
      expect(getUrlParams("?returnToLobby=false").returnToLobby).toBe(true);
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
});

/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, onTestFinished, vi } from "vitest";
import { logger } from "matrix-js-sdk/lib/logger";

import * as PlatformMod from "../src/Platform";
import {
  getRoomIdentifierFromUrl,
  computeUrlParams,
  HeaderStyle,
  getUrlParams,
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
      expect(computeUrlParams().preload).toBe(false);
    });

    it("ignored in SPA mode", () => {
      expect(computeUrlParams("?preload=true").preload).toBe(false);
    });

    it("respected in widget mode", () => {
      expect(
        computeUrlParams(
          "?preload=true&widgetId=12345&parentUrl=https%3A%2F%2Flocalhost%2Ffoo",
        ).preload,
      ).toBe(true);
    });
  });

  describe("returnToLobby", () => {
    it("is false in SPA mode", () => {
      expect(computeUrlParams("?returnToLobby=true").returnToLobby).toBe(false);
    });

    it("defaults to false in widget mode", () => {
      expect(
        computeUrlParams(
          "?widgetId=12345&parentUrl=https%3A%2F%2Flocalhost%2Ffoo",
        ).returnToLobby,
      ).toBe(false);
    });

    it("respected in widget mode", () => {
      expect(
        computeUrlParams(
          "?returnToLobby=true&widgetId=12345&parentUrl=https%3A%2F%2Flocalhost%2Ffoo",
        ).returnToLobby,
      ).toBe(true);
    });
  });

  describe("userId", () => {
    it("is ignored in SPA mode", () => {
      expect(computeUrlParams("?userId=asd").userId).toBe(null);
    });

    it("is parsed in widget mode", () => {
      expect(
        computeUrlParams(
          "?userId=asd&widgetId=12345&parentUrl=https%3A%2F%2Flocalhost%2Ffoo",
        ).userId,
      ).toBe("asd");
    });
  });

  describe("deviceId", () => {
    it("is ignored in SPA mode", () => {
      expect(computeUrlParams("?deviceId=asd").deviceId).toBe(null);
    });

    it("is parsed in widget mode", () => {
      expect(
        computeUrlParams(
          "?deviceId=asd&widgetId=12345&parentUrl=https%3A%2F%2Flocalhost%2Ffoo",
        ).deviceId,
      ).toBe("asd");
    });
  });

  describe("baseUrl", () => {
    it("is ignored in SPA mode", () => {
      expect(computeUrlParams("?baseUrl=asd").baseUrl).toBe(null);
    });

    it("is parsed in widget mode", () => {
      expect(
        computeUrlParams(
          "?baseUrl=asd&widgetId=12345&parentUrl=https%3A%2F%2Flocalhost%2Ffoo",
        ).baseUrl,
      ).toBe("asd");
    });
  });

  describe("viaServers", () => {
    it("is ignored in widget mode", () => {
      expect(
        computeUrlParams(
          "?viaServers=asd&widgetId=12345&parentUrl=https%3A%2F%2Flocalhost%2Ffoo",
        ).viaServers,
      ).toBe(null);
    });

    it("is parsed in SPA mode", () => {
      expect(computeUrlParams("?viaServers=asd").viaServers).toBe("asd");
    });
  });

  describe("homeserver", () => {
    it("is ignored in widget mode", () => {
      expect(
        computeUrlParams(
          "?homeserver=asd&widgetId=12345&parentUrl=https%3A%2F%2Flocalhost%2Ffoo",
        ).homeserver,
      ).toBe(null);
    });

    it("is parsed in SPA mode", () => {
      expect(computeUrlParams("?homeserver=asd").homeserver).toBe("asd");
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
      preload: false,
      header: platform === "desktop" ? HeaderStyle.None : HeaderStyle.AppBar,
      showControls: true,
      hideScreensharing: false,
      allowIceFallback: true,
      perParticipantE2EE: true,
      controlledAudioDevices: platform === "desktop" ? false : true,
      skipLobby: true,
      returnToLobby: false,
      sendNotificationType: platform === "desktop" ? "notification" : "ring",
    });
    const joinExistingCallDefaults = (platform: string): object => ({
      confineToRoom: true,
      appPrompt: false,
      preload: false,
      header: platform === "desktop" ? HeaderStyle.None : HeaderStyle.AppBar,
      showControls: true,
      hideScreensharing: false,
      allowIceFallback: true,
      perParticipantE2EE: true,
      controlledAudioDevices: platform === "desktop" ? false : true,
      skipLobby: false,
      returnToLobby: false,
      sendNotificationType: "notification",
      defaultAudioEnabled: true,
      defaultVideoEnabled: true,
    });
    it("use no-intent-defaults with unknown intent", () => {
      expect(computeUrlParams()).toMatchObject(noIntentDefaults);
    });

    it("ignores intent if it is not a valid value", () => {
      expect(computeUrlParams("?intent=foo")).toMatchObject(noIntentDefaults);
    });

    it("accepts start_call", () => {
      expect(
        computeUrlParams(
          "?intent=start_call&widgetId=1234&parentUrl=parent.org",
        ),
      ).toMatchObject({ ...startNewCallDefaults("desktop"), skipLobby: false });
    });

    it("accepts start_call_dm mobile", () => {
      vi.spyOn(PlatformMod, "platform", "get").mockReturnValue("android");
      onTestFinished(() => {
        vi.spyOn(PlatformMod, "platform", "get").mockReturnValue("desktop");
      });
      expect(
        computeUrlParams(
          "?intent=start_call_dm&widgetId=1234&parentUrl=parent.org",
        ),
      ).toMatchObject(startNewCallDefaults("android"));
    });

    it("accepts start_call_dm mobile and prioritizes overwritten params", () => {
      vi.spyOn(PlatformMod, "platform", "get").mockReturnValue("android");
      onTestFinished(() => {
        vi.spyOn(PlatformMod, "platform", "get").mockReturnValue("desktop");
      });
      expect(
        computeUrlParams(
          "?intent=start_call_dm&widgetId=1234&parentUrl=parent.org&sendNotificationType=notification",
        ),
      ).toMatchObject({
        ...startNewCallDefaults("android"),
        sendNotificationType: "notification",
      });
    });

    it("accepts join_existing", () => {
      expect(
        computeUrlParams(
          "?intent=join_existing&widgetId=1234&parentUrl=parent.org",
        ),
      ).toMatchObject(joinExistingCallDefaults("desktop"));
    });
  });

  describe("skipLobby", () => {
    it("defaults to false", () => {
      expect(computeUrlParams().skipLobby).toBe(false);
    });

    it("defaults to false if intent is start_call in SPA mode", () => {
      expect(computeUrlParams("?intent=start_call").skipLobby).toBe(false);
    });

    it("defaults to false if intent is start_call in widget mode", () => {
      expect(
        computeUrlParams(
          "?intent=start_call&widgetId=12345&parentUrl=https%3A%2F%2Flocalhost%2Ffoo",
        ).skipLobby,
      ).toBe(false);
    });

    it("default to false if intent is join_existing", () => {
      expect(computeUrlParams("?intent=join_existing").skipLobby).toBe(false);
    });
  });

  describe("noiseSuppression", () => {
    it("defaults to true", () => {
      expect(computeUrlParams().noiseSuppression).toBe(true);
    });

    it("is parsed", () => {
      expect(
        computeUrlParams("?intent=start_call&noiseSuppression=true")
          .noiseSuppression,
      ).toBe(true);
      expect(
        computeUrlParams("?intent=start_call&noiseSuppression&bar=foo")
          .noiseSuppression,
      ).toBe(true);
      expect(computeUrlParams("?noiseSuppression=false").noiseSuppression).toBe(
        false,
      );
    });
  });

  describe("echoCancellation", () => {
    it("defaults to true", () => {
      expect(computeUrlParams().echoCancellation).toBe(true);
    });

    it("is parsed", () => {
      expect(computeUrlParams("?echoCancellation=true").echoCancellation).toBe(
        true,
      );
      expect(computeUrlParams("?echoCancellation=false").echoCancellation).toBe(
        false,
      );
    });
  });

  describe("header", () => {
    it("uses header if provided", () => {
      expect(computeUrlParams("?header=app_bar&hideHeader=true").header).toBe(
        "app_bar",
      );
      expect(computeUrlParams("?header=none&hideHeader=false").header).toBe(
        "none",
      );
    });
  });
  describe("getUrlParams", () => {
    it("uses cached values", () => {
      const spy = vi.spyOn(logger, "info");
      // call get once
      const params = getUrlParams("?header=app_bar&hideHeader=true", "");
      // call get twice
      expect(getUrlParams("?header=app_bar&hideHeader=true", "")).toBe(params);
      // expect compute to only be called once
      // it will only log when it is computing the values
      expect(spy).toHaveBeenCalledExactlyOnceWith(
        "UrlParams: final set of url params\n",
        "intent:",
        "unknown",
        "\nproperties:",
        expect.any(Object),
        "configuration:",
        expect.any(Object),
        "intentAndPlatformDerivedConfiguration:",
        {},
      );
    });
  });
});

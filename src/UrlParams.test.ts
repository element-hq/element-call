/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { getRoomIdentifierFromUrl } from "../src/UrlParams";

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
});

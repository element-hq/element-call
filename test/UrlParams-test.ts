/*
Copyright 2023 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { mocked } from "jest-mock";
import { getUrlParams } from "../src/UrlParams";
import { Config } from "../src/config/Config";

const ROOM_NAME = "roomNameHere";
const ROOM_ID = "d45f138fsd";
const ORIGIN = "https://call.element.io";
const HOMESERVER = "call.ems.host";

jest.mock("../src/config/Config");

describe("UrlParams", () => {
  beforeAll(() => {
    mocked(Config.defaultServerName).mockReturnValue("call.ems.host");
  });

  describe("handles URL with /room/", () => {
    it("and nothing else", () => {
      expect(
        getUrlParams(false, {
          origin: ORIGIN,
          href: `${ORIGIN}/room/${ROOM_NAME}`,
          search: "",
          hash: "",
        } as Location).roomAlias
      ).toBe(`#${ROOM_NAME}:${HOMESERVER}`);
    });

    it("and #", () => {
      expect(
        getUrlParams(false, {
          origin: ORIGIN,
          href: `${ORIGIN}/room/#${ROOM_NAME}`,
          search: "",
          hash: "",
        } as Location).roomAlias
      ).toBe(`#${ROOM_NAME}:${HOMESERVER}`);
    });

    it("and # and server part", () => {
      expect(
        getUrlParams(false, {
          origin: ORIGIN,
          href: `${ORIGIN}/room/#${ROOM_NAME}:${HOMESERVER}`,
          search: "",
          hash: "",
        } as Location).roomAlias
      ).toBe(`#${ROOM_NAME}:${HOMESERVER}`);
    });

    it("and server part", () => {
      expect(
        getUrlParams(false, {
          origin: ORIGIN,
          href: `${ORIGIN}/room/${ROOM_NAME}:${HOMESERVER}`,
          search: "",
          hash: "",
        } as Location).roomAlias
      ).toBe(`#${ROOM_NAME}:${HOMESERVER}`);
    });
  });

  describe("handles URL without /room/", () => {
    it("and nothing else", () => {
      expect(
        getUrlParams(false, {
          origin: ORIGIN,
          href: `${ORIGIN}/${ROOM_NAME}`,
          search: "",
          hash: "",
        } as Location).roomAlias
      ).toBe(`#${ROOM_NAME}:${HOMESERVER}`);
    });

    it("and with #", () => {
      expect(
        getUrlParams(false, {
          origin: ORIGIN,
          href: `${ORIGIN}/room/#${ROOM_NAME}`,
          search: "",
          hash: "",
        } as Location).roomAlias
      ).toBe(`#${ROOM_NAME}:${HOMESERVER}`);
    });

    it("and with # and server part", () => {
      expect(
        getUrlParams(false, {
          origin: ORIGIN,
          href: `${ORIGIN}/room/#${ROOM_NAME}:${HOMESERVER}`,
          search: "",
          hash: "",
        } as Location).roomAlias
      ).toBe(`#${ROOM_NAME}:${HOMESERVER}`);
    });

    it("and with server part", () => {
      expect(
        getUrlParams(false, {
          origin: ORIGIN,
          href: `${ORIGIN}/room/${ROOM_NAME}:${HOMESERVER}`,
          search: "",
          hash: "",
        } as Location).roomAlias
      ).toBe(`#${ROOM_NAME}:${HOMESERVER}`);
    });
  });

  describe("handles search params", () => {
    it("(roomId)", () => {
      expect(
        getUrlParams(true, {
          search: `?roomId=${ROOM_ID}`,
          hash: "",
        } as Location).roomId
      ).toBe(ROOM_ID);
    });
  });

  it("ignores room alias", () => {
    expect(
      getUrlParams(true, {
        origin: ORIGIN,
        href: `${ORIGIN}/room/${ROOM_NAME}:${HOMESERVER}`,
        hash: "",
        search: "",
      } as Location).roomAlias
    ).toBeFalsy();
  });
});

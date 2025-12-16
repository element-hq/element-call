/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  type MockedObject,
  vitest,
} from "vitest";
import fetchMock from "fetch-mock";
import { getSFUConfigWithOpenID, OpenIDClientParts } from "./openIDSFU";
import { testJWTToken } from "../utils/test-fixtures";

const sfuUrl = "https://sfu.example.org";

describe("getSFUConfigWithOpenID", () => {
  let matrixClient: MockedObject<OpenIDClientParts>;
  beforeEach(() => {
    matrixClient = {
      getOpenIdToken: vitest.fn(),
      getDeviceId: vitest.fn(),
    };
  });
  afterEach(() => {
    vitest.clearAllMocks();
    fetchMock.reset();
  });
  it("should handle fetching a token", async () => {
    fetchMock.post("https://sfu.example.org/sfu/get", () => {
      return {
        status: 200,
        body: { url: sfuUrl, jwt: testJWTToken },
      };
    });
    const config = await getSFUConfigWithOpenID(
      matrixClient,
      "https://sfu.example.org",
      "!example_room_id",
    );
    expect(config).toEqual({
      jwt: testJWTToken,
      url: sfuUrl,
      livekitIdentity: "@me:example.org:ABCDEF",
      livekitAlias: "!example_room_id",
    });
    await fetchMock.flush();
  });
  it("should fail if the SFU errors", async () => {
    fetchMock.post("https://sfu.example.org/sfu/get", () => {
      return {
        status: 500,
        body: { error: "Test failure" },
      };
    });
    try {
      await getSFUConfigWithOpenID(
        matrixClient,
        "https://sfu.example.org",
        "!example_room_id",
      );
    } catch (ex) {
      expect(((ex as Error).cause as Error).message).toEqual(
        "SFU Config fetch failed with status code 500",
      );
      await fetchMock.flush();
      return;
    }
    expect.fail("Expected test to throw;");
  });

  it("should retry fetching the openid token", async () => {
    let count = 0;
    matrixClient.getOpenIdToken.mockImplementation(async () => {
      count++;
      if (count < 2) {
        throw Error("Test failure");
      }
      return {
        token_type: "Bearer",
        access_token: "foobar",
        matrix_server_name: "example.org",
        expires_in: 30,
      };
    });
    fetchMock.post("https://sfu.example.org/sfu/get", () => {
      return {
        status: 200,
        body: { url: sfuUrl, jwt: testJWTToken },
      };
    });
    const config = await getSFUConfigWithOpenID(
      matrixClient,
      "https://sfu.example.org",
      "!example_room_id",
    );
    expect(config).toEqual({
      jwt: testJWTToken,
      url: sfuUrl,
      livekitIdentity: "@me:example.org:ABCDEF",
      livekitAlias: "!example_room_id",
    });
    await fetchMock.flush();
  });
});

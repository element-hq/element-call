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
import { MatrixError } from "matrix-js-sdk";

import { getSFUConfigWithOpenID, type OpenIDClientParts } from "./openIDSFU";
import { testJWTToken } from "../utils/test-fixtures";
import { ownMemberMock } from "../utils/test";
import { FailToGetOpenIdToken } from "../utils/errors";

const sfuUrl = "https://sfu.example.org";

describe("getSFUConfigWithOpenID", () => {
  let matrixClient: MockedObject<OpenIDClientParts>;
  beforeEach(() => {
    fetchMock.catch(404);
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
      ownMemberMock,
      "https://sfu.example.org",
      "!example_room_id",
    );
    expect(config).toEqual({
      jwt: testJWTToken,
      url: sfuUrl,
      livekitIdentity: "@me:example.org:ABCDEF",
      livekitAlias: "!example_room_id",
    });
    void (await fetchMock.flush());
  });

  it("should fail if the SFU errors", async () => {
    fetchMock.post("https://sfu.example.org/sfu/get", () => {
      return {
        status: 500,
        body: {
          errcode: "M_LOOKUP_FAILED",
          error: "Failed to look up user info from homeserver",
        },
      };
    });
    try {
      await getSFUConfigWithOpenID(
        matrixClient,
        ownMemberMock,
        "https://sfu.example.org",
        "!example_room_id",
      );
    } catch (ex: unknown) {
      expect(ex).toBeInstanceOf(FailToGetOpenIdToken);
      expect((ex as FailToGetOpenIdToken).cause).toBeInstanceOf(MatrixError);
      const mxError = (ex as Error).cause as MatrixError;
      expect(mxError.message).toEqual(
        "MatrixError: [500] Failed to look up user info from homeserver",
      );

      void (await fetchMock.flush());
      return;
    }
    expect.fail("Expected test to throw;");
  });

  it("should retry without delay params if the JWT service legacy endpoint returns M_BAD_JSON 400", async () => {
    let callCount = 0;

    fetchMock.post(
      "https://sfu.example.org/sfu/get",
      (url, opts) => {
        callCount++;
        const body = JSON.parse(opts.body as string);

        // First call: check if it has delay parts and return 400
        if (callCount === 1) {
          expect(body).toHaveProperty("delay_id", "mock_delay_id");
          return {
            status: 400,
            body: { errcode: "M_BAD_JSON", error: "Unsupported parameters" },
          };
        }

        // Second call: check if delay parts were stripped and return success
        expect(body).not.toHaveProperty("delay_id");
        expect(body).not.toHaveProperty("delay_timeout");
        expect(body).not.toHaveProperty("delay_cs_api_url");

        return {
          status: 200,
          body: { url: sfuUrl, jwt: testJWTToken },
        };
      },
      { overwriteRoutes: true },
    );

    // Note: Assuming getSFUConfigWithOpenID eventually calls getLiveKitJWT
    const config = await getSFUConfigWithOpenID(
      matrixClient,
      ownMemberMock,
      "https://sfu.example.org",
      "!example_room_id",
      {
        delayEndpointBaseUrl: "https://matrix.homeserverserver.org",
        delayId: "mock_delay_id",
      },
    );

    expect(config.jwt).toBe(testJWTToken);
    expect(callCount).toBe(2);
    void (await fetchMock.flush());
  });

  it("should successfully send delay parameters to the JWT service legacy endpoint", async () => {
    fetchMock.post(
      "https://sfu.example.org/sfu/get",
      (url, opts) => {
        const body = JSON.parse(opts.body as string);

        // Verify, that the request contains the expected delay parameters
        if (
          body.delay_id === "mock_delay_id" &&
          body.delay_timeout === 10000 &&
          body.delay_cs_api_url === "https://homeserverserver.org/cs_api"
        ) {
          return {
            status: 200,
            body: { url: sfuUrl, jwt: testJWTToken },
          };
        }
        return {
          status: 400,
          body: { error: "Missing expected delay params" },
        };
      },
      { overwriteRoutes: true },
    );

    const config = await getSFUConfigWithOpenID(
      matrixClient,
      ownMemberMock,
      "https://sfu.example.org",
      "!example_room_id",
      {
        delayEndpointBaseUrl: "https://homeserverserver.org/cs_api",
        delayId: "mock_delay_id",
      },
    );

    // Prüfe das Ergebnis
    expect(config).toMatchObject({
      jwt: testJWTToken,
      url: sfuUrl,
    });

    void (await fetchMock.flush());
  });

  it("should try legacy and then new endpoint with delay delegation", async () => {
    fetchMock.post("https://sfu.example.org/get_token", () => {
      return {
        status: 500,
        body: {
          errcode: "M_LOOKUP_FAILED",
          error: "Failed to look up user info from homeserver",
        },
      };
    });
    fetchMock.post("https://sfu.example.org/sfu/get", () => {
      return {
        status: 500,
        body: {
          errcode: "M_LOOKUP_FAILED",
          error: "Failed to look up user info from homeserver",
        },
      };
    });
    try {
      await getSFUConfigWithOpenID(
        matrixClient,
        ownMemberMock,
        "https://sfu.example.org",
        "!example_room_id",
        {
          delayEndpointBaseUrl: "https://matrix.homeserverserver.org",
          delayId: "mock_delay_id",
        },
      );
    } catch (ex) {
      expect(ex).toBeInstanceOf(FailToGetOpenIdToken);
      expect((ex as FailToGetOpenIdToken).cause).toBeInstanceOf(MatrixError);
      const mxError = (ex as Error).cause as MatrixError;
      expect(mxError.message).toEqual(
        "MatrixError: [500] Failed to look up user info from homeserver",
      );
      void (await fetchMock.flush());
    }
    const calls = fetchMock.calls();
    expect(calls.length).toBe(2);

    expect(calls[0][0]).toStrictEqual("https://sfu.example.org/get_token");
    expect(calls[0][1]).toStrictEqual({
      // check if it uses correct delayID!
      body: '{"room_id":"!example_room_id","slot_id":"m.call#ROOM","member":{"id":"@alice:example.org:DEVICE","claimed_user_id":"@alice:example.org","claimed_device_id":"DEVICE"},"delay_id":"mock_delay_id","delay_timeout":10000,"delay_cs_api_url":"https://matrix.homeserverserver.org"}',
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    expect(calls[1][0]).toStrictEqual("https://sfu.example.org/sfu/get");

    expect(calls[1][1]).toStrictEqual({
      body: '{"room":"!example_room_id","device_id":"DEVICE","delay_id":"mock_delay_id","delay_timeout":10000,"delay_cs_api_url":"https://matrix.homeserverserver.org"}',
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  });

  it("dont try legacy if endpoint with delay delegation is sucessful", async () => {
    fetchMock.post("https://sfu.example.org/get_token", () => {
      return {
        status: 200,
        body: { url: sfuUrl, jwt: testJWTToken },
      };
    });
    fetchMock.post("https://sfu.example.org/sfu/get", () => {
      return {
        status: 500,
        body: { error: "Test failure" },
      };
    });
    try {
      await getSFUConfigWithOpenID(
        matrixClient,
        ownMemberMock,
        "https://sfu.example.org",
        "!example_room_id",
        {
          delayEndpointBaseUrl: "https://matrix.homeserverserver.org",
          delayId: "mock_delay_id",
        },
      );
    } catch (ex) {
      expect(ex).toBeInstanceOf(FailToGetOpenIdToken);
      expect((ex as FailToGetOpenIdToken).cause).toEqual(
        new Error("SFU Config fetch failed with status code 500"),
      );
      void (await fetchMock.flush());
    }
    const calls = fetchMock.calls();
    expect(calls.length).toBe(1);

    expect(calls[0][0]).toStrictEqual("https://sfu.example.org/get_token");
    expect(calls[0][1]).toStrictEqual({
      // check if it uses correct delayID!
      body: '{"room_id":"!example_room_id","slot_id":"m.call#ROOM","member":{"id":"@alice:example.org:DEVICE","claimed_user_id":"@alice:example.org","claimed_device_id":"DEVICE"},"delay_id":"mock_delay_id","delay_timeout":10000,"delay_cs_api_url":"https://matrix.homeserverserver.org"}',
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });
  });

  it("should retry fetching the openid token", async () => {
    let count = 0;
    matrixClient.getOpenIdToken.mockImplementation(async () => {
      count++;
      if (count < 2) {
        throw Error("Test failure");
      }
      return Promise.resolve({
        token_type: "Bearer",
        access_token: "foobar",
        matrix_server_name: "example.org",
        expires_in: 30,
      });
    });
    fetchMock.post("https://sfu.example.org/sfu/get", () => {
      return {
        status: 200,
        body: { url: sfuUrl, jwt: testJWTToken },
      };
    });
    const config = await getSFUConfigWithOpenID(
      matrixClient,
      ownMemberMock,
      "https://sfu.example.org",
      "!example_room_id",
    );
    expect(config).toEqual({
      jwt: testJWTToken,
      url: sfuUrl,
      livekitIdentity: "@me:example.org:ABCDEF",
      livekitAlias: "!example_room_id",
    });
    void (await fetchMock.flush());
  });
});

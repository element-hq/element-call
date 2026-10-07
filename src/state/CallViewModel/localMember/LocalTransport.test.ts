/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockedObject,
  vi,
} from "vitest";
import fetchMock from "fetch-mock";

import { mockConfig, ownMemberMock } from "../../../utils/test";
import { getLocalTransport } from "./LocalTransport";
import {
  MatrixRTCTransportMissingError,
  FailToGetOpenIdToken,
} from "../../../utils/errors";
import * as livekitAuth from "../../../livekit/auth";
import { customTransport } from "../../../settings/settings";
import { testJWTToken } from "../../../utils/test-fixtures";
import { type MatrixClient } from "matrix-js-sdk";

describe("LocalTransport", () => {
  const sfuConfig: livekitAuth.SFUConfig = {
    url: "https://lk.example.org",
    jwt: testJWTToken,
    livekitAlias: "Akph4alDMhen",
    livekitIdentity: "@lk_user:ABCDEF",
  };

  beforeEach(() => vi.clearAllMocks());

  it("throws if config is missing", async () => {
    await expect(
      getLocalTransport({
        _unstable_getRTCTransports: async () => Promise.resolve([]),
        getDomain: () => "example.org",
      }),
    ).rejects.toThrow(new MatrixRTCTransportMissingError("example.org"));
  });

  it("threes if SFU config fetch fails", async () => {
    // Provide a valid config so makeTransportInternal resolves a transport
    mockConfig({
      livekit: { livekit_service_url: "https://lk.example.org" },
    });
    vi.spyOn(livekitAuth, "getSFUConfig").mockRejectedValue(
      new FailToGetOpenIdToken(new Error("no openid")),
    );

    await expect(
      getLocalTransport({
        getDomain: () => "example.org",
        _unstable_getRTCTransports: async () => Promise.resolve([]),
      }),
    ).rejects.toThrow(new FailToGetOpenIdToken(new Error("no openid")));
  });

  it("returns preferred transport", async () => {
    // Use config so transport discovery succeeds, but delay OpenID JWT fetch
    mockConfig({
      livekit: { livekit_service_url: "https://lk.example.org" },
    });

    vi.spyOn(livekitAuth, "getSFUConfig").mockResolvedValue({
      url: "https://lk.example.org",
      jwt: "jwt",
      livekitAlias: "Akph4alDMhen",
      livekitIdentity: ownMemberMock.userId + ":" + ownMemberMock.deviceId,
    });

    expect(
      await getLocalTransport({
        _unstable_getRTCTransports: async () => Promise.resolve([]),
        getDomain: () => "example.org",
      }),
    ).toStrictEqual({
      transport: {
        livekit_service_url: "https://lk.example.org",
        type: "livekit",
      },
      sfuConfig: {
        jwt: "jwt",
        livekitAlias: "Akph4alDMhen",
        livekitIdentity: "@alice:example.org:DEVICE",
        url: "https://lk.example.org",
      },
    });
  });

  describe("transport configuration mechanisms", () => {
    let client: MockedObject<
      Pick<MatrixClient, "getDomain" | "_unstable_getRTCTransports">
    >;
    beforeEach(() => {
      mockConfig({});
      customTransport.setValue(customTransport.defaultValue);
      client = {
        getDomain: vi.fn().mockReturnValue("example.org"),
        _unstable_getRTCTransports: vi.fn().mockResolvedValue([]),
      };
    });

    afterEach(() => {
      fetchMock.reset();
    });

    it("supports getting transport via application config", async () => {
      mockConfig({
        livekit: { livekit_service_url: "https://lk.example.org" },
      });
      vi.spyOn(livekitAuth, "getSFUConfig").mockResolvedValue(sfuConfig);

      expect(await getLocalTransport(client)).toStrictEqual({
        transport: {
          livekit_service_url: "https://lk.example.org",
          type: "livekit",
        },
        sfuConfig: {
          jwt: "e30=.eyJzdWIiOiJAbWU6ZXhhbXBsZS5vcmc6QUJDREVGIiwidmlkZW8iOnsicm9vbSI6IiFleGFtcGxlX3Jvb21faWQifX0=.e30=",
          livekitAlias: "Akph4alDMhen",
          livekitIdentity: "@lk_user:ABCDEF",
          url: "https://lk.example.org",
        },
      });
    });

    it("supports getting transport via user settings", async () => {
      customTransport.setValue({
        type: "livekit",
        livekit_service_url: "https://lk.example.org",
      });
      vi.spyOn(livekitAuth, "getSFUConfig").mockResolvedValue(sfuConfig);

      expect(await getLocalTransport(client)).toStrictEqual({
        transport: {
          livekit_service_url: "https://lk.example.org",
          type: "livekit",
        },
        sfuConfig: {
          jwt: "e30=.eyJzdWIiOiJAbWU6ZXhhbXBsZS5vcmc6QUJDREVGIiwidmlkZW8iOnsicm9vbSI6IiFleGFtcGxlX3Jvb21faWQifX0=.e30=",
          livekitAlias: "Akph4alDMhen",
          livekitIdentity: "@lk_user:ABCDEF",
          url: "https://lk.example.org",
        },
      });
    });

    it("supports getting transport via backend", async () => {
      client._unstable_getRTCTransports.mockResolvedValue([
        { type: "livekit", livekit_service_url: "https://lk.example.org" },
      ]);
      vi.spyOn(livekitAuth, "getSFUConfig").mockResolvedValue(sfuConfig);

      expect(await getLocalTransport(client)).toStrictEqual({
        transport: {
          livekit_service_url: "https://lk.example.org",
          type: "livekit",
        },
        sfuConfig: {
          jwt: "e30=.eyJzdWIiOiJAbWU6ZXhhbXBsZS5vcmc6QUJDREVGIiwidmlkZW8iOnsicm9vbSI6IiFleGFtcGxlX3Jvb21faWQifX0=.e30=",
          livekitAlias: "Akph4alDMhen",
          livekitIdentity: "@lk_user:ABCDEF",
          url: "https://lk.example.org",
        },
      });
    });

    it("fails fast if the openID request fails for backend config", async () => {
      client._unstable_getRTCTransports.mockResolvedValue([
        { type: "livekit", livekit_service_url: "https://lk.example.org" },
      ]);
      vi.spyOn(livekitAuth, "getSFUConfig").mockRejectedValue(
        new FailToGetOpenIdToken(new Error("Test driven error")),
      );

      await expect(getLocalTransport(client)).rejects.toThrow(
        expect.any(FailToGetOpenIdToken),
      );
    });

    it("throws if no options are available", async () => {
      await expect(
        getLocalTransport({
          getDomain: () => "example.org",
          _unstable_getRTCTransports: async () => Promise.resolve([]),
        }),
      ).rejects.toThrow(new MatrixRTCTransportMissingError("example.org"));
    });
  });
});

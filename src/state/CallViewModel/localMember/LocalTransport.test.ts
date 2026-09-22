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
import * as openIDSFU from "../../../livekit/openIDSFU";
import { customLivekitUrl } from "../../../settings/settings";
import { testJWTToken } from "../../../utils/test-fixtures";
import { MatrixRTCMode } from "../../../config/ConfigOptions";

describe("LocalTransport", () => {
  const openIdResponse: openIDSFU.SFUConfig = {
    url: "https://lk.example.org",
    jwt: testJWTToken,
    livekitAlias: "Akph4alDMhen",
    livekitIdentity: "@lk_user:ABCDEF",
  };

  beforeEach(() => vi.clearAllMocks());

  it("throws if config is missing", async () => {
    await expect(
      getLocalTransport({
        roomId: "!room:example.org",
        client: {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          _unstable_getRTCTransports: async () => Promise.resolve([]),
          getDomain: () => "example.org",
          // These won't be called in this error path but satisfy the type
          getOpenIdToken: vi.fn(),
          getDeviceId: vi.fn(),
        },
        ownMembershipIdentity: ownMemberMock,
        matrixRTCMode: MatrixRTCMode.Compatibility,
      }),
    ).rejects.toThrow(new MatrixRTCTransportMissingError("example.org"));
  });

  it("throws FailToGetOpenIdToken when OpenID fetch fails", async () => {
    // Provide a valid config so makeTransportInternal resolves a transport
    mockConfig({
      livekit: { livekit_service_url: "https://lk.example.org" },
    });
    vi.spyOn(openIDSFU, "getSFUConfigWithOpenID").mockRejectedValue(
      new FailToGetOpenIdToken(new Error("no openid")),
    );

    await expect(
      getLocalTransport({
        roomId: "!example_room_id",
        client: {
          getDomain: () => "example.org",
          // eslint-disable-next-line @typescript-eslint/naming-convention
          _unstable_getRTCTransports: async () => Promise.resolve([]),
          getOpenIdToken: vi.fn(),
          getDeviceId: vi.fn(),
        },
        ownMembershipIdentity: ownMemberMock,
        matrixRTCMode: MatrixRTCMode.Compatibility,
      }),
    ).rejects.toThrow(new FailToGetOpenIdToken(new Error("no openid")));
  });

  it("returns preferred transport", async () => {
    // Use config so transport discovery succeeds, but delay OpenID JWT fetch
    mockConfig({
      livekit: { livekit_service_url: "https://lk.example.org" },
    });

    vi.spyOn(openIDSFU, "getSFUConfigWithOpenID").mockResolvedValue({
      url: "https://lk.example.org",
      jwt: "jwt",
      livekitAlias: "Akph4alDMhen",
      livekitIdentity: ownMemberMock.userId + ":" + ownMemberMock.deviceId,
    });

    expect(
      await getLocalTransport({
        roomId: "!room:example.org",
        client: {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          _unstable_getRTCTransports: async () => Promise.resolve([]),
          getDomain: () => "example.org",
          getOpenIdToken: vi.fn(),
          getDeviceId: vi.fn(),
        },
        ownMembershipIdentity: ownMemberMock,
        matrixRTCMode: MatrixRTCMode.Compatibility,
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

  type LocalTransportProps = Parameters<typeof getLocalTransport>[0];

  describe("transport configuration mechanisms", () => {
    let localTransportOpts: LocalTransportProps & {
      client: MockedObject<LocalTransportProps["client"]>;
    };
    beforeEach(() => {
      mockConfig({});
      customLivekitUrl.setValue(customLivekitUrl.defaultValue);
      localTransportOpts = {
        ownMembershipIdentity: ownMemberMock,
        roomId: "!example_room_id",
        matrixRTCMode: MatrixRTCMode.Compatibility,
        client: {
          getDomain: vi.fn().mockReturnValue("example.org"),
          // eslint-disable-next-line @typescript-eslint/naming-convention
          _unstable_getRTCTransports: vi.fn().mockResolvedValue([]),
          getOpenIdToken: vi.fn(),
          getDeviceId: vi.fn(),
        },
      };
    });

    afterEach(() => {
      fetchMock.reset();
    });

    it("supports getting transport via application config", async () => {
      mockConfig({
        livekit: { livekit_service_url: "https://lk.example.org" },
      });
      vi.spyOn(openIDSFU, "getSFUConfigWithOpenID").mockResolvedValue(
        openIdResponse,
      );

      expect(await getLocalTransport(localTransportOpts)).toStrictEqual({
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
      customLivekitUrl.setValue("https://lk.example.org");
      vi.spyOn(openIDSFU, "getSFUConfigWithOpenID").mockResolvedValue(
        openIdResponse,
      );

      expect(await getLocalTransport(localTransportOpts)).toStrictEqual({
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
      localTransportOpts.client._unstable_getRTCTransports.mockResolvedValue([
        { type: "livekit", livekit_service_url: "https://lk.example.org" },
      ]);
      vi.spyOn(openIDSFU, "getSFUConfigWithOpenID").mockResolvedValue(
        openIdResponse,
      );

      expect(await getLocalTransport(localTransportOpts)).toStrictEqual({
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
      localTransportOpts.client._unstable_getRTCTransports.mockResolvedValue([
        { type: "livekit", livekit_service_url: "https://lk.example.org" },
      ]);
      vi.spyOn(openIDSFU, "getSFUConfigWithOpenID").mockRejectedValue(
        new FailToGetOpenIdToken(new Error("Test driven error")),
      );

      await expect(getLocalTransport(localTransportOpts)).rejects.toThrow(
        expect.any(FailToGetOpenIdToken),
      );
    });

    it("throws if no options are available", async () => {
      await expect(
        getLocalTransport({
          ownMembershipIdentity: ownMemberMock,
          roomId: "!example_room_id",
          matrixRTCMode: MatrixRTCMode.Compatibility,
          client: {
            getDomain: () => "example.org",
            // eslint-disable-next-line @typescript-eslint/naming-convention
            _unstable_getRTCTransports: async () => Promise.resolve([]),
            // These won't be called in this error path but satisfy the type
            getOpenIdToken: vi.fn(),
            getDeviceId: vi.fn(),
          },
        }),
      ).rejects.toThrow(new MatrixRTCTransportMissingError("example.org"));
    });
  });
});

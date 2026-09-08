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
import { type CallMembership } from "matrix-js-sdk/lib/matrixrtc";
import { lastValueFrom } from "rxjs";
import fetchMock from "fetch-mock";

import {
  mockConfig,
  flushPromises,
  ownMemberMock,
  testScope,
} from "../../../utils/test";
import { createLocalTransport$, JwtEndpointVersion } from "./LocalTransport";
import { constant } from "../../Behavior";
import { Epoch, ObservableScope } from "../../ObservableScope";
import {
  MatrixRTCTransportMissingError,
  FailToGetOpenIdToken,
} from "../../../utils/errors";
import * as openIDSFU from "../../../livekit/openIDSFU";
import { customLivekitUrl } from "../../../settings/settings";
import { testJWTToken } from "../../../utils/test-fixtures";

describe("LocalTransport", () => {
  const openIdResponse: openIDSFU.SFUConfig = {
    url: "https://lk.example.org",
    jwt: testJWTToken,
    livekitAlias: "Akph4alDMhen",
    livekitIdentity: "@lk_user:ABCDEF",
  };

  beforeEach(() => vi.clearAllMocks());

  it("throws if config is missing", async () => {
    const { advertised$, active$ } = createLocalTransport$({
      scope: testScope(),
      roomId: "!room:example.org",
      memberships$: constant(new Epoch<CallMembership[]>([])),
      client: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        _unstable_getRTCTransports: async () => Promise.resolve([]),
        getDomain: () => "example.org",
        baseUrl: "example.org",
        // These won't be called in this error path but satisfy the type
        getOpenIdToken: vi.fn(),
        getDeviceId: vi.fn(),
      },
      ownMembershipIdentity: ownMemberMock,
      forceJwtEndpoint: JwtEndpointVersion.Legacy,
    });
    await flushPromises();

    expect(() => advertised$.value).toThrow(
      new MatrixRTCTransportMissingError("example.org"),
    );
    expect(() => active$.value).toThrow(
      new MatrixRTCTransportMissingError("example.org"),
    );
  });

  it("throws FailToGetOpenIdToken when OpenID fetch fails", async () => {
    // Provide a valid config so makeTransportInternal resolves a transport
    const scope = new ObservableScope();
    mockConfig({
      livekit: { livekit_service_url: "https://lk.example.org" },
    });
    const resolver = Promise.withResolvers<void>();
    vi.spyOn(openIDSFU, "getSFUConfigWithOpenID").mockImplementation(
      async () => {
        await resolver.promise;
        throw new FailToGetOpenIdToken(new Error("no openid"));
      },
    );
    const observations: unknown[] = [];
    const errors: Error[] = [];
    const { advertised$, active$ } = createLocalTransport$({
      scope,
      roomId: "!example_room_id",
      memberships$: constant(new Epoch<CallMembership[]>([])),
      client: {
        baseUrl: "https://example.org",
        getDomain: () => "example.org",
        // eslint-disable-next-line @typescript-eslint/naming-convention
        _unstable_getRTCTransports: async () => Promise.resolve([]),
        getOpenIdToken: vi.fn(),
        getDeviceId: vi.fn(),
      },
      ownMembershipIdentity: ownMemberMock,
      forceJwtEndpoint: JwtEndpointVersion.Legacy,
    });
    active$.subscribe(
      (o) => observations.push(o),
      (e) => errors.push(e),
    );
    resolver.resolve();
    await flushPromises();

    const expectedError = new FailToGetOpenIdToken(new Error("no openid"));
    expect(observations).toStrictEqual([null]);
    expect(errors).toStrictEqual([expectedError]);
    expect(() => advertised$.value).toThrow(expectedError);
    expect(() => active$.value).toThrow(expectedError);
  });

  it("emits preferred transport after OpenID resolves", async () => {
    // Use config so transport discovery succeeds, but delay OpenID JWT fetch
    mockConfig({
      livekit: { livekit_service_url: "https://lk.example.org" },
    });

    const openIdResolver = Promise.withResolvers<openIDSFU.SFUConfig>();

    vi.spyOn(openIDSFU, "getSFUConfigWithOpenID").mockReturnValue(
      openIdResolver.promise,
    );

    const { advertised$, active$ } = createLocalTransport$({
      scope: testScope(),
      roomId: "!room:example.org",
      memberships$: constant(new Epoch<CallMembership[]>([])),
      client: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        _unstable_getRTCTransports: async () => Promise.resolve([]),
        getDomain: () => "example.org",
        getOpenIdToken: vi.fn(),
        getDeviceId: vi.fn(),
        baseUrl: "https://example.org",
      },
      ownMembershipIdentity: ownMemberMock,
      forceJwtEndpoint: JwtEndpointVersion.Legacy,
    });

    openIdResolver.resolve?.({
      url: "https://lk.example.org",
      jwt: "jwt",
      livekitAlias: "Akph4alDMhen",
      livekitIdentity: ownMemberMock.userId + ":" + ownMemberMock.deviceId,
    });
    expect(advertised$.value).toBe(null);
    expect(active$.value).toBe(null);
    await flushPromises();
    // final
    const expectedTransport = {
      livekit_service_url: "https://lk.example.org",
      type: "livekit",
    };
    expect(advertised$.value).toStrictEqual(expectedTransport);
    expect(active$.value).toStrictEqual({
      transport: expectedTransport,
      sfuConfig: {
        jwt: "jwt",
        livekitAlias: "Akph4alDMhen",
        livekitIdentity: "@alice:example.org:DEVICE",
        url: "https://lk.example.org",
      },
    });
  });

  type LocalTransportProps = Parameters<typeof createLocalTransport$>[0];

  describe("transport configuration mechanisms", () => {
    let localTransportOpts: LocalTransportProps & {
      client: MockedObject<LocalTransportProps["client"]>;
    };
    let openIdResolver: PromiseWithResolvers<openIDSFU.SFUConfig>;
    beforeEach(() => {
      mockConfig({});
      customLivekitUrl.setValue(customLivekitUrl.defaultValue);
      localTransportOpts = {
        ownMembershipIdentity: ownMemberMock,
        scope: testScope(),
        roomId: "!example_room_id",
        forceJwtEndpoint: JwtEndpointVersion.Legacy,
        memberships$: constant(new Epoch<CallMembership[]>([])),
        client: {
          baseUrl: "https://example.org",
          getDomain: vi.fn().mockReturnValue("example.org"),
          // eslint-disable-next-line @typescript-eslint/naming-convention
          _unstable_getRTCTransports: vi.fn().mockResolvedValue([]),
          getOpenIdToken: vi.fn(),
          getDeviceId: vi.fn(),
        },
      };
      openIdResolver = Promise.withResolvers<openIDSFU.SFUConfig>();
      vi.spyOn(openIDSFU, "getSFUConfigWithOpenID").mockReturnValue(
        openIdResolver.promise,
      );
    });

    afterEach(() => {
      fetchMock.reset();
    });

    it("supports getting transport via application config", async () => {
      mockConfig({
        livekit: { livekit_service_url: "https://lk.example.org" },
      });
      const { advertised$, active$ } =
        createLocalTransport$(localTransportOpts);
      openIdResolver.resolve?.(openIdResponse);
      expect(advertised$.value).toBe(null);
      expect(active$.value).toBe(null);
      await flushPromises();
      const expectedTransport = {
        livekit_service_url: "https://lk.example.org",
        type: "livekit",
      };
      expect(advertised$.value).toStrictEqual(expectedTransport);
      expect(active$.value).toStrictEqual({
        transport: expectedTransport,
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
      const { advertised$, active$ } =
        createLocalTransport$(localTransportOpts);
      openIdResolver.resolve?.(openIdResponse);
      expect(advertised$.value).toBe(null);
      await flushPromises();
      expect(active$.value).toStrictEqual({
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
      const { advertised$, active$ } =
        createLocalTransport$(localTransportOpts);
      openIdResolver.resolve?.(openIdResponse);
      expect(advertised$.value).toBe(null);
      expect(active$.value).toBe(null);
      await flushPromises();
      const expectedTransport = {
        livekit_service_url: "https://lk.example.org",
        type: "livekit",
      };
      expect(advertised$.value).toStrictEqual(expectedTransport);
      expect(active$.value).toStrictEqual({
        transport: expectedTransport,
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
      openIdResolver.reject(
        new FailToGetOpenIdToken(new Error("Test driven error")),
      );
      await expect(async () =>
        lastValueFrom(createLocalTransport$(localTransportOpts).active$),
      ).rejects.toThrow(expect.any(FailToGetOpenIdToken));
    });

    it("throws if no options are available", async () => {
      const { advertised$, active$ } = createLocalTransport$({
        scope: testScope(),
        ownMembershipIdentity: ownMemberMock,
        roomId: "!example_room_id",
        forceJwtEndpoint: JwtEndpointVersion.Legacy,
        memberships$: constant(new Epoch<CallMembership[]>([])),
        client: {
          getDomain: () => "example.org",
          baseUrl: "https://example.org",
          // eslint-disable-next-line @typescript-eslint/naming-convention
          _unstable_getRTCTransports: async () => Promise.resolve([]),
          // These won't be called in this error path but satisfy the type
          getOpenIdToken: vi.fn(),
          getDeviceId: vi.fn(),
        },
      });
      await flushPromises();

      expect(() => advertised$.value).toThrow(
        new MatrixRTCTransportMissingError("example.org"),
      );
      expect(() => active$.value).toThrow(
        new MatrixRTCTransportMissingError("example.org"),
      );
    });
  });
});

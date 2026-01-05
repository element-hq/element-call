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
import { BehaviorSubject, lastValueFrom } from "rxjs";
import fetchMock from "fetch-mock";

import { mockConfig, flushPromises, ownMemberMock } from "../../../utils/test";
import { createLocalTransport$ } from "./LocalTransport";
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
    livekitAlias: "!example_room_id",
    livekitIdentity: "@lk_user:ABCDEF",
  };

  let scope: ObservableScope;
  beforeEach(() => (scope = new ObservableScope()));
  afterEach(() => scope.end());

  it("throws if config is missing", async () => {
    const localTransport$ = createLocalTransport$({
      scope,
      roomId: "!room:example.org",
      useOldestMember$: constant(false),
      memberships$: constant(new Epoch<CallMembership[]>([])),
      client: {
        getDomain: () => "",
        baseUrl: "example.org",
        // These won't be called in this error path but satisfy the type
        getOpenIdToken: vi.fn(),
        getDeviceId: vi.fn(),
      },
      ownMembershipIdentity: ownMemberMock,
      useOldJwtEndpoint$: constant(false),
      delayId$: constant("delay_id_mock"),
    });
    await flushPromises();

    expect(() => localTransport$.value).toThrow(
      new MatrixRTCTransportMissingError(""),
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
    const localTransport$ = createLocalTransport$({
      scope,
      roomId: "!example_room_id",
      useOldestMember$: constant(false),
      memberships$: constant(new Epoch<CallMembership[]>([])),
      client: {
        baseUrl: "https://lk.example.org",
        // Use empty domain to skip .well-known and use config directly
        getDomain: () => "",
        // eslint-disable-next-line @typescript-eslint/naming-convention
        _unstable_getRTCTransports: async () => Promise.resolve([]),
        getOpenIdToken: vi.fn(),
        getDeviceId: vi.fn(),
      },
      ownMembershipIdentity: ownMemberMock,
      useOldJwtEndpoint$: constant(false),
      delayId$: constant("delay_id_mock"),
    });
    localTransport$.subscribe(
      (o) => observations.push(o),
      (e) => errors.push(e),
    );
    resolver.resolve();
    await flushPromises();

    const expectedError = new FailToGetOpenIdToken(new Error("no openid"));
    expect(observations).toStrictEqual([null]);
    expect(errors).toStrictEqual([expectedError]);
    expect(() => localTransport$.value).toThrow(expectedError);
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

    const localTransport$ = createLocalTransport$({
      scope,
      roomId: "!room:example.org",
      useOldestMember$: constant(false),
      memberships$: constant(new Epoch<CallMembership[]>([])),
      client: {
        getDomain: () => "",
        getOpenIdToken: vi.fn(),
        getDeviceId: vi.fn(),
        baseUrl: "https://lk.example.org",
      },
      ownMembershipIdentity: ownMemberMock,
      useOldJwtEndpoint$: constant(false),
      delayId$: constant("delay_id_mock"),
    });

    openIdResolver.resolve?.({ url: "https://lk.example.org", jwt: "jwt" });
    expect(localTransport$.value).toBe(null);
    await flushPromises();
    // final
    expect(localTransport$.value).toStrictEqual({
      livekit_alias: "!room:example.org",
      livekit_service_url: "https://lk.example.org",
      type: "livekit",
    });
  });

  it("updates local transport when oldest member changes", async () => {
    // Use config so transport discovery succeeds, but delay OpenID JWT fetch
    mockConfig({
      livekit: { livekit_service_url: "https://lk.example.org" },
    });
    const memberships$ = new BehaviorSubject(new Epoch([]));
    const openIdResolver = Promise.withResolvers<openIDSFU.SFUConfig>();

    vi.spyOn(openIDSFU, "getSFUConfigWithOpenID").mockReturnValue(
      openIdResolver.promise,
    );

    const localTransport$ = createLocalTransport$({
      scope,
      roomId: "!example_room_id",
      useOldestMember$: constant(true),
      memberships$,
      client: {
        getDomain: () => "",
        // eslint-disable-next-line @typescript-eslint/naming-convention
        _unstable_getRTCTransports: async () => Promise.resolve([]),
        getOpenIdToken: vi.fn(),
        getDeviceId: vi.fn(),
        baseUrl: "https://lk.example.org",
      },
      ownMembershipIdentity: ownMemberMock,
      useOldJwtEndpoint$: constant(false),
      delayId$: constant("delay_id_mock"),
    });

    openIdResolver.resolve?.(openIdResponse);
    expect(localTransport$.value).toBe(null);
    await flushPromises();
    // final
    expect(localTransport$.value).toStrictEqual({
      livekit_alias: "!example_room_id",
      livekit_service_url: "https://lk.example.org",
      type: "livekit",
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
        scope,
        roomId: "!example_room_id",
        useOldestMember$: constant(false),
        memberships$: constant(new Epoch<CallMembership[]>([])),
        client: {
          getDomain: vi.fn().mockReturnValue(""),
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
      const localTransport$ = createLocalTransport$(localTransportOpts);
      openIdResolver.resolve?.(openIdResponse);
      expect(localTransport$.value).toBe(null);
      await flushPromises();
      expect(localTransport$.value).toStrictEqual({
        livekit_alias: "!example_room_id",
        livekit_service_url: "https://lk.example.org",
        type: "livekit",
      });
    });
    it("supports getting transport via user settings", async () => {
      customLivekitUrl.setValue("https://lk.example.org");
      const localTransport$ = createLocalTransport$(localTransportOpts);
      openIdResolver.resolve?.(openIdResponse);
      expect(localTransport$.value).toBe(null);
      await flushPromises();
      expect(localTransport$.value).toStrictEqual({
        livekit_alias: "!example_room_id",
        livekit_service_url: "https://lk.example.org",
        type: "livekit",
      });
    });
    it("supports getting transport via backend", async () => {
      localTransportOpts.client._unstable_getRTCTransports.mockResolvedValue([
        { type: "livekit", livekit_service_url: "https://lk.example.org" },
      ]);
      const localTransport$ = createLocalTransport$(localTransportOpts);
      openIdResolver.resolve?.(openIdResponse);
      expect(localTransport$.value).toBe(null);
      await flushPromises();
      expect(localTransport$.value).toStrictEqual({
        livekit_alias: "!example_room_id",
        livekit_service_url: "https://lk.example.org",
        type: "livekit",
      });
    });
    it("fails fast if the openID request fails for backend config", async () => {
      localTransportOpts.client._unstable_getRTCTransports.mockResolvedValue([
        { type: "livekit", livekit_service_url: "https://lk.example.org" },
      ]);
      openIdResolver.reject(
        new FailToGetOpenIdToken(new Error("Test driven error")),
      );
      try {
        await lastValueFrom(createLocalTransport$(localTransportOpts));
        throw Error("Expected test to throw");
      } catch (ex) {
        expect(ex).toBeInstanceOf(FailToGetOpenIdToken);
      }
    });
    it("supports getting transport via well-known", async () => {
      localTransportOpts.client.getDomain.mockReturnValue("example.org");
      fetchMock.getOnce("https://example.org/.well-known/matrix/client", {
        "org.matrix.msc4143.rtc_foci": [
          { type: "livekit", livekit_service_url: "https://lk.example.org" },
        ],
      });
      const localTransport$ = createLocalTransport$(localTransportOpts);
      openIdResolver.resolve?.(openIdResponse);
      expect(localTransport$.value).toBe(null);
      await flushPromises();
      expect(localTransport$.value).toStrictEqual({
        livekit_alias: "!example_room_id",
        livekit_service_url: "https://lk.example.org",
        type: "livekit",
      });
      expect(fetchMock.done()).toEqual(true);
    });
    it("fails fast if the openId request fails for the well-known config", async () => {
      localTransportOpts.client.getDomain.mockReturnValue("example.org");
      fetchMock.getOnce("https://example.org/.well-known/matrix/client", {
        "org.matrix.msc4143.rtc_foci": [
          { type: "livekit", livekit_service_url: "https://lk.example.org" },
        ],
      });
      openIdResolver.reject(
        new FailToGetOpenIdToken(new Error("Test driven error")),
      );
      try {
        await lastValueFrom(createLocalTransport$(localTransportOpts));
        throw Error("Expected test to throw");
      } catch (ex) {
        expect(ex).toBeInstanceOf(FailToGetOpenIdToken);
      }
    });
    it("throws if no options are available", async () => {
      const localTransport$ = createLocalTransport$({
        scope,
        roomId: "!example_room_id",
        useOldestMember$: constant(false),
        memberships$: constant(new Epoch<CallMembership[]>([])),
        client: {
          getDomain: () => "",
          // eslint-disable-next-line @typescript-eslint/naming-convention
          _unstable_getRTCTransports: async () => Promise.resolve([]),
          // These won't be called in this error path but satisfy the type
          getOpenIdToken: vi.fn(),
          getDeviceId: vi.fn(),
        },
      });
      await flushPromises();

      expect(() => localTransport$.value).toThrow(
        new MatrixRTCTransportMissingError(""),
      );
    });
  });
});

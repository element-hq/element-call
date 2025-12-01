/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type CallMembership } from "matrix-js-sdk/lib/matrixrtc";
import { BehaviorSubject } from "rxjs";

import { mockConfig, flushPromises } from "../../../utils/test";
import { createLocalTransport$ } from "./LocalTransport";
import { constant } from "../../Behavior";
import { Epoch, ObservableScope } from "../../ObservableScope";
import {
  MatrixRTCTransportMissingError,
  FailToGetOpenIdToken,
} from "../../../utils/errors";
import * as openIDSFU from "../../../livekit/openIDSFU";

describe("LocalTransport", () => {
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
      roomId: "!room:example.org",
      useOldestMember$: constant(false),
      memberships$: constant(new Epoch<CallMembership[]>([])),
      client: {
        // Use empty domain to skip .well-known and use config directly
        getDomain: () => "",
        getOpenIdToken: vi.fn(),
        getDeviceId: vi.fn(),
      },
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
      },
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
      roomId: "!room:example.org",
      useOldestMember$: constant(true),
      memberships$,
      client: {
        getDomain: () => "",
        getOpenIdToken: vi.fn(),
        getDeviceId: vi.fn(),
      },
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
});

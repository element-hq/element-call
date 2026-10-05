/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import fetchMock from "fetch-mock";
import { logger } from "matrix-js-sdk/lib/logger";
import { type LivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
import { BehaviorSubject } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";

import { ObservableScope } from "../../reactive/ObservableScope";
import { testScope } from "../../utils/test";
import { MediaConnectionState } from "../api";
import { ConnectionState } from "./Connection";
import { toMediaConnectionState } from "./connectionState";
import { createTransportRegistry, supportsDelegation } from "./LivekitBackend";
import { exampleTransport } from "./test";

const otherTransport: LivekitTransport = {
  type: "livekit",
  livekit_service_url: "https://other.example.org",
};

describe("createTransportRegistry", () => {
  it("connects to a transport once however many members are on it, and drops it with the last", () => {
    const registry = createTransportRegistry(testScope());
    const urls = (): string[] =>
      registry.transports$.value.value.map((t) => t.livekit_service_url);
    const alice = new ObservableScope();
    const bob = new ObservableScope();

    registry.follow(alice, new BehaviorSubject(exampleTransport));
    registry.follow(bob, new BehaviorSubject(exampleTransport));
    expect(urls()).toEqual([exampleTransport.livekit_service_url]);

    alice.end();
    expect(urls()).toEqual([exampleTransport.livekit_service_url]);

    bob.end();
    expect(urls()).toEqual([]);
  });

  it("follows a member that changes transport", () => {
    const registry = createTransportRegistry(testScope());
    const transport$ = new BehaviorSubject<LivekitTransport | undefined>(
      exampleTransport,
    );

    registry.follow(testScope(), transport$);
    transport$.next(otherTransport);
    expect(registry.transports$.value.value).toEqual([otherTransport]);

    transport$.next(undefined);
    expect(registry.transports$.value.value).toEqual([]);
  });

  it("is safe to release after the registry's own scope has ended", () => {
    const scope = new ObservableScope();
    const registry = createTransportRegistry(scope);
    const member = new ObservableScope();
    registry.follow(member, new BehaviorSubject(exampleTransport));

    scope.end();
    expect(() => member.end()).not.toThrow();
  });
});

describe("supportsDelegation", () => {
  afterEach(() => fetchMock.reset());
  const homeserver = "https://matrix.example.org";
  const homeserverEndpoint = `${homeserver}/_matrix/client/unstable/io.element.msc4195/rtc/livekit/delegate_delayed_leave`;
  const transportEndpoint = `${exampleTransport.livekit_service_url}/delegate_delayed_leave`;

  it.each([
    ["the homeserver supports it", 400, 404, true],
    ["only the transport supports it", 404, 400, true],
    ["neither supports it", 404, 404, false],
  ])("%s", async (_name, homeserverStatus, transportStatus, expected) => {
    fetchMock.post(homeserverEndpoint, homeserverStatus);
    fetchMock.post(transportEndpoint, transportStatus);
    await expect(
      supportsDelegation(homeserver, exampleTransport, logger),
    ).resolves.toBe(expected);
  });

  it("assumes no support where the probe itself fails", async () => {
    fetchMock.post(homeserverEndpoint, { throws: new TypeError("CORS") });
    fetchMock.post(transportEndpoint, { throws: new TypeError("CORS") });
    await expect(
      supportsDelegation(homeserver, exampleTransport, logger),
    ).resolves.toBe(false);
  });
});

describe("toMediaConnectionState", () => {
  it("maps every LiveKit state and passes an error through", () => {
    expect(toMediaConnectionState(ConnectionState.FetchingConfig)).toBe(
      MediaConnectionState.Preparing,
    );
    expect(toMediaConnectionState(ConnectionState.LivekitConnected)).toBe(
      MediaConnectionState.Connected,
    );
    expect(
      toMediaConnectionState(ConnectionState.LivekitSignalReconnecting),
    ).toBe(MediaConnectionState.Reconnecting);
    const error = new Error("gone");
    expect(toMediaConnectionState(error)).toBe(error);
  });
});

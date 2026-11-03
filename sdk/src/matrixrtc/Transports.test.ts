/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Transport } from "matrix-js-sdk/lib/matrixrtc";
import { BehaviorSubject } from "rxjs";
import { describe, expect, it } from "vitest";

import { type ResolvedTransport } from "../api";
import {
  type BackendConnection,
  MediaConnectionState,
} from "../media-backend/api";
import { testScope } from "../utils/test";
import { createTransportRegistry, transportId } from "./Transports";

const sfu: Transport = { type: "livekit", livekit_service_url: "https://sfu" };
const resolved: ResolvedTransport = {
  type: "livekit",
  url: "wss://sfu",
  token: "jwt",
  roomAlias: "room",
  identity: "me",
};

describe("transportId", () => {
  it("does not depend on the order a sender wrote the keys in", () => {
    expect(transportId({ type: "livekit", livekit_service_url: "u" })).toBe(
      transportId({ livekit_service_url: "u", type: "livekit" }),
    );
  });

  it("tells transports of the same type apart", () => {
    expect(transportId(sfu)).not.toBe(
      transportId({ ...sfu, livekit_service_url: "https://other" }),
    );
  });
});

describe("createTransportRegistry", () => {
  it("hands out one metadata object per transport", () => {
    const registry = createTransportRegistry(
      testScope(),
      new BehaviorSubject<BackendConnection[]>([]),
    );
    expect(registry.get(sfu)).toBe(registry.get({ ...sfu }));
    expect(registry.get(sfu).id).toBe(transportId(sfu));
  });

  it("derives the connected transports and what was resolved from the backend's connections", () => {
    const connections$ = new BehaviorSubject<BackendConnection[]>([]);
    const registry = createTransportRegistry(testScope(), connections$);
    const metadata = registry.get(sfu);
    expect(registry.connected$.value).toEqual([]);
    expect(metadata.resolved$.value).toBeUndefined();

    connections$.next([
      { transport: sfu, state: MediaConnectionState.Connecting, resolved },
    ]);
    expect(registry.connected$.value).toEqual([]);
    expect(metadata.resolved$.value).toBe(resolved);

    connections$.next([
      { transport: sfu, state: MediaConnectionState.Connected, resolved },
    ]);
    expect(registry.connected$.value).toEqual([metadata]);
  });
});

/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  beforeEach,
  describe,
  expect,
  it,
  type MockedObject,
  vi,
} from "vitest";
import { type IClientWellKnown, MatrixError } from "matrix-js-sdk";
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";
import {
  type LivekitTransportConfig,
  type Transport,
} from "matrix-js-sdk/lib/matrixrtc";

import type { ResolvedConfigOptions } from "../../../config/ConfigOptions.ts";
import {
  RtcTransportAutoDiscovery,
  type RtcTransportAutoDiscoveryProps,
} from "./RtcTransportAutoDiscovery.ts";

type DiscoveryClient = RtcTransportAutoDiscoveryProps["client"];

const backendTransport: LivekitTransportConfig = {
  type: "livekit",
  livekit_service_url: "https://backend.example.org",
};

const wellKnownTransport: LivekitTransportConfig = {
  type: "livekit",
  livekit_service_url: "https://well-known.example.org",
};

const configTransport: LivekitTransportConfig = {
  type: "livekit",
  livekit_service_url: "https://config.example.org",
};

function makeClient(): MockedObject<DiscoveryClient> {
  return {
    getDomain: vi.fn().mockReturnValue("example.org"),
    baseUrl: "https://matrix.example.org",
    _unstable_getRTCTransports: vi.fn().mockResolvedValue([]),
    getAccessToken: vi.fn().mockReturnValue("access_token"),
    getOpenIdToken: vi.fn(),
    getDeviceId: vi.fn(),
  } as unknown as MockedObject<DiscoveryClient>;
}

function makeResolvedConfig(livekitServiceUrl?: string): ResolvedConfigOptions {
  return {
    livekit: livekitServiceUrl
      ? {
          livekit_service_url: livekitServiceUrl,
        }
      : undefined,
  } as ResolvedConfigOptions;
}

function makeWellKnown(rtcFoci?: Transport[]): IClientWellKnown {
  return {
    "org.matrix.msc4143.rtc_foci": rtcFoci,
  } as unknown as IClientWellKnown;
}

// Error returned by a homeserver that does not implement the endpoint. This is
// the only failure that permits falling back to the legacy `.well-known` lookup.
const notImplementedError = new MatrixError({ errcode: "M_UNRECOGNIZED" }, 404);

function makeDiscovery(
  overrides: Partial<RtcTransportAutoDiscoveryProps> & {
    client: DiscoveryClient;
    wellKnownFetcher: RtcTransportAutoDiscoveryProps["wellKnownFetcher"];
  },
): RtcTransportAutoDiscovery {
  return new RtcTransportAutoDiscovery({
    resolvedConfig: makeResolvedConfig("https://config.example.org"),
    enableClientWellKnownLookups: true,
    logger: rootLogger,
    ...overrides,
  });
}

describe("RtcTransportAutoDiscovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const VALID_TEST_CASES: Array<{ transports: Transport[] }> = [
    { transports: [backendTransport] },
    // will pick the first livekit transport in the list, even if there are other non-livekit transports
    { transports: [{ type: "not_livekit" }, backendTransport] },
  ];
  it.each(VALID_TEST_CASES)(
    "prefers backend transport over well-known and app config $transports",
    async ({ transports }) => {
      const client = makeClient();
      client._unstable_getRTCTransports.mockResolvedValue(transports);

      const wellKnownFetcher = vi
        .fn<(domain: string) => Promise<IClientWellKnown>>()
        .mockResolvedValue(makeWellKnown([wellKnownTransport]));

      const discovery = makeDiscovery({ client, wellKnownFetcher });

      await expect(
        discovery.discoverPreferredTransport(),
      ).resolves.toStrictEqual(backendTransport);

      expect(client._unstable_getRTCTransports).toHaveBeenCalledTimes(1);
      expect(wellKnownFetcher).not.toHaveBeenCalled();
    },
  );

  it("Retries limit_exceeded backend transport over well-known", async () => {
    const client = makeClient();
    client._unstable_getRTCTransports
      .mockRejectedValueOnce(
        new MatrixError(
          {
            errcode: "M_LIMIT_EXCEEDED",
            error: "Too many requests",
            retry_after_ms: 100,
          },
          429,
        ),
      )
      .mockResolvedValue([backendTransport]);

    const wellKnownFetcher = vi
      .fn<(domain: string) => Promise<IClientWellKnown>>()
      .mockResolvedValue(makeWellKnown([wellKnownTransport]));

    const discovery = makeDiscovery({ client, wellKnownFetcher });

    await expect(discovery.discoverPreferredTransport()).resolves.toStrictEqual(
      backendTransport,
    );

    expect(client._unstable_getRTCTransports).toHaveBeenCalledTimes(2);
    expect(wellKnownFetcher).not.toHaveBeenCalled();
  });

  // A homeserver that implements the endpoint but returns no usable livekit
  // transport has answered authoritatively, so we must NOT leak to the legacy
  // `.well-known` lookup. Instead we fall straight through to app config.
  const AUTHORITATIVE_EMPTY_CASES: Array<{ transports: Transport[] }> = [
    { transports: [] },
    { transports: [{ type: "not_livekit" }] },
  ];
  it.each(AUTHORITATIVE_EMPTY_CASES)(
    "does not fall back to well-known when the backend answers without a livekit transport $transports",
    async ({ transports }) => {
      const client = makeClient();
      client._unstable_getRTCTransports.mockResolvedValue(transports);

      const wellKnownFetcher = vi
        .fn<(domain: string) => Promise<IClientWellKnown>>()
        .mockResolvedValue(makeWellKnown([wellKnownTransport]));

      const discovery = makeDiscovery({ client, wellKnownFetcher });

      await expect(
        discovery.discoverPreferredTransport(),
      ).resolves.toStrictEqual(configTransport);

      expect(wellKnownFetcher).not.toHaveBeenCalled();
    },
  );

  it("falls back to well-known only when the backend returns 404 M_UNRECOGNIZED", async () => {
    const client = makeClient();
    client._unstable_getRTCTransports.mockRejectedValue(notImplementedError);

    const wellKnownFetcher = vi
      .fn<(domain: string) => Promise<IClientWellKnown>>()
      .mockResolvedValue(makeWellKnown([wellKnownTransport]));

    const discovery = makeDiscovery({ client, wellKnownFetcher });

    await expect(discovery.discoverPreferredTransport()).resolves.toStrictEqual(
      wellKnownTransport,
    );

    expect(wellKnownFetcher).toHaveBeenCalledWith("example.org");
  });

  it("does not fall back to well-known when the backend fails with a non-M_UNRECOGNIZED errcode", async () => {
    const client = makeClient();
    // Same 404 status as the not-implemented case, but a different errcode: only
    // M_UNRECOGNIZED is treated as "endpoint not implemented".
    client._unstable_getRTCTransports.mockRejectedValue(
      new MatrixError({ errcode: "M_UNKNOWN" }, 404),
    );

    const wellKnownFetcher = vi
      .fn<(domain: string) => Promise<IClientWellKnown>>()
      .mockResolvedValue(makeWellKnown([wellKnownTransport]));

    const discovery = makeDiscovery({ client, wellKnownFetcher });

    await expect(discovery.discoverPreferredTransport()).resolves.toStrictEqual(
      configTransport,
    );

    expect(wellKnownFetcher).not.toHaveBeenCalled();
  });

  it("skips backend discovery in widget mode and uses well-known", async () => {
    const client = makeClient();
    // widget mode is detected by the absence of an access token
    client.getAccessToken.mockReturnValue(null);

    const wellKnownFetcher = vi
      .fn<(domain: string) => Promise<IClientWellKnown>>()
      .mockResolvedValue(makeWellKnown([wellKnownTransport]));

    const discovery = makeDiscovery({ client, wellKnownFetcher });

    await expect(discovery.discoverPreferredTransport()).resolves.toStrictEqual(
      wellKnownTransport,
    );

    expect(client._unstable_getRTCTransports).not.toHaveBeenCalled();
    expect(wellKnownFetcher).toHaveBeenCalledWith("example.org");
  });

  it("does not make well-known lookups when disabled by config, even in widget mode", async () => {
    const client = makeClient();
    // widget mode: backend endpoint is not attempted
    client.getAccessToken.mockReturnValue(null);

    const wellKnownFetcher = vi
      .fn<(domain: string) => Promise<IClientWellKnown>>()
      .mockResolvedValue(makeWellKnown([wellKnownTransport]));

    const discovery = makeDiscovery({
      client,
      wellKnownFetcher,
      enableClientWellKnownLookups: false,
    });

    // The legacy well-known fallback is skipped entirely; only app config is used.
    await expect(discovery.discoverPreferredTransport()).resolves.toStrictEqual(
      configTransport,
    );

    expect(wellKnownFetcher).not.toHaveBeenCalled();
  });

  it("falls back to app config when the backend is not implemented and well-known has no rtc_foci", async () => {
    const client = makeClient();
    client._unstable_getRTCTransports.mockRejectedValue(notImplementedError);

    const wellKnownFetcher = vi
      .fn<(domain: string) => Promise<IClientWellKnown>>()
      .mockResolvedValue({} as IClientWellKnown);

    const discovery = makeDiscovery({ client, wellKnownFetcher });

    await expect(discovery.discoverPreferredTransport()).resolves.toStrictEqual(
      configTransport,
    );

    expect(wellKnownFetcher).toHaveBeenCalledWith("example.org");
  });

  it("returns null when backend, well-known and config are all unavailable", async () => {
    const client = makeClient();
    client._unstable_getRTCTransports.mockRejectedValue(notImplementedError);

    const wellKnownFetcher = vi
      .fn<(domain: string) => Promise<IClientWellKnown>>()
      .mockResolvedValue({} as IClientWellKnown);

    const discovery = makeDiscovery({
      client,
      wellKnownFetcher,
      resolvedConfig: makeResolvedConfig(undefined),
    });

    await expect(discovery.discoverPreferredTransport()).resolves.toBeNull();
  });
});

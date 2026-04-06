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
      // it("prefers backend transport over well-known and app config", async () => {
      const client = makeClient();
      client._unstable_getRTCTransports.mockResolvedValue(transports);

      const wellKnownFetcher = vi
        .fn<(domain: string) => Promise<IClientWellKnown>>()
        .mockResolvedValue(makeWellKnown([wellKnownTransport]));

      const discovery = new RtcTransportAutoDiscovery({
        client,
        resolvedConfig: makeResolvedConfig("https://config.example.org"),
        wellKnownFetcher,
        logger: rootLogger,
      });

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

    const discovery = new RtcTransportAutoDiscovery({
      client,
      resolvedConfig: makeResolvedConfig("https://config.example.org"),
      wellKnownFetcher,
      logger: rootLogger,
    });

    await expect(discovery.discoverPreferredTransport()).resolves.toStrictEqual(
      backendTransport,
    );

    expect(client._unstable_getRTCTransports).toHaveBeenCalledTimes(2);
    expect(wellKnownFetcher).not.toHaveBeenCalled();
  });

  const INVALID_TEST_CASES: Array<{ transports: Transport[] }> = [
    { transports: [] },
    { transports: [{ type: "not_livekit" }] },
  ];
  it.each(INVALID_TEST_CASES)(
    "falls back to well-known when backend has no (valid) livekit transports $transports",
    async ({ transports }) => {
      const client = makeClient();
      client._unstable_getRTCTransports.mockResolvedValue(transports);

      const wellKnownFetcher = vi
        .fn<(domain: string) => Promise<IClientWellKnown>>()
        .mockResolvedValue(makeWellKnown([wellKnownTransport]));

      const discovery = new RtcTransportAutoDiscovery({
        client,
        resolvedConfig: makeResolvedConfig("https://config.example.org"),
        wellKnownFetcher,
        logger: rootLogger,
      });

      await expect(
        discovery.discoverPreferredTransport(),
      ).resolves.toStrictEqual(wellKnownTransport);

      expect(wellKnownFetcher).toHaveBeenCalledWith("example.org");
    },
  );

  it("skips backend discovery in widget mode and uses well-known", async () => {
    const client = makeClient();
    // widget mode is detected by the absence of an access token
    client.getAccessToken.mockReturnValue(null);

    const wellKnownFetcher = vi
      .fn<(domain: string) => Promise<IClientWellKnown>>()
      .mockResolvedValue(makeWellKnown([wellKnownTransport]));

    const discovery = new RtcTransportAutoDiscovery({
      client,
      resolvedConfig: makeResolvedConfig("https://config.example.org"),
      wellKnownFetcher,
      logger: rootLogger,
    });

    await expect(discovery.discoverPreferredTransport()).resolves.toStrictEqual(
      wellKnownTransport,
    );

    expect(client._unstable_getRTCTransports).not.toHaveBeenCalled();
    expect(wellKnownFetcher).toHaveBeenCalledWith("example.org");
  });

  it("falls back to app config when backend fails and well-known has no rtc_foci", async () => {
    const client = makeClient();
    client._unstable_getRTCTransports.mockRejectedValue(
      new MatrixError({ errcode: "M_UNKNOWN" }, 404),
    );

    const wellKnownFetcher = vi
      .fn<(domain: string) => Promise<IClientWellKnown>>()
      .mockResolvedValue({} as IClientWellKnown);

    const discovery = new RtcTransportAutoDiscovery({
      client,
      resolvedConfig: makeResolvedConfig("https://config.example.org"),
      wellKnownFetcher,
      logger: rootLogger,
    });

    await expect(discovery.discoverPreferredTransport()).resolves.toStrictEqual(
      {
        type: "livekit",
        livekit_service_url: "https://config.example.org",
      },
    );
  });

  it("returns null when backend, well-known and config are all unavailable", async () => {
    const client = makeClient();
    client._unstable_getRTCTransports.mockResolvedValue([]);

    const wellKnownFetcher = vi
      .fn<(domain: string) => Promise<IClientWellKnown>>()
      .mockResolvedValue({} as IClientWellKnown);

    const discovery = new RtcTransportAutoDiscovery({
      client,
      resolvedConfig: makeResolvedConfig(undefined),
      wellKnownFetcher,
      logger: rootLogger,
    });

    await expect(discovery.discoverPreferredTransport()).resolves.toBeNull();
  });
});

/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/lib/logger";
import { type Transport } from "matrix-js-sdk/lib/matrixrtc";
import { describe, expect, it, vi } from "vitest";

import { MatrixRTCTransportMissingError } from "../errors";
import { discoverLocalTransport } from "./LocalTransport";

const homeserverTransport: Transport = {
  type: "livekit",
  livekit_service_url: "https://homeserver.example.org",
};
const hostTransport: Transport = {
  type: "livekit",
  livekit_service_url: "https://host.example.org",
};
const bobsTransport: Transport = {
  type: "livekit",
  url: "wss://sfu.bob.com",
  server_name: "bob.com",
};
const carolsTransport: Transport = {
  type: "livekit",
  url: "wss://sfu.carol.com",
  server_name: "carol.com",
};

function client(
  advertised: Transport[],
): Parameters<typeof discoverLocalTransport>[0] {
  return {
    getDomain: () => "example.org",
    _unstable_getRTCTransports: vi.fn().mockResolvedValue(advertised),
  };
}

function fromBackends(
  transports: Transport[] = [],
): ReturnType<typeof vi.fn<() => Promise<Transport[]>>> {
  return vi.fn(async () => Promise.resolve(transports));
}

describe("discoverLocalTransport", () => {
  it("takes the transport the host names without asking the homeserver", async () => {
    const c = client([homeserverTransport]);

    await expect(
      discoverLocalTransport(
        c,
        "livekit",
        { transport: hostTransport },
        fromBackends(),
        logger,
      ),
    ).resolves.toBe(hostTransport);
    expect(c._unstable_getRTCTransports).not.toHaveBeenCalled();
  });

  it("prefers the homeserver's transport over the host's fallback", async () => {
    await expect(
      discoverLocalTransport(
        client([homeserverTransport]),
        "livekit",
        { fallbackTransport: hostTransport },
        fromBackends(),
        logger,
      ),
    ).resolves.toEqual(homeserverTransport);
  });

  it("falls back to the host's transport where the homeserver advertises none of the type", async () => {
    await expect(
      discoverLocalTransport(
        client([{ type: "not_livekit" }]),
        "livekit",
        { fallbackTransport: hostTransport },
        fromBackends(),
        logger,
      ),
    ).resolves.toEqual(hostTransport);
  });

  it("prefers a local transport over the backends' without asking them", async () => {
    const backends = fromBackends([bobsTransport]);

    await expect(
      discoverLocalTransport(
        client([homeserverTransport]),
        "livekit",
        {},
        backends,
        logger,
      ),
    ).resolves.toEqual(homeserverTransport);
    expect(backends).not.toHaveBeenCalled();
  });

  it("takes the first transport the backends provide where there is no local one", async () => {
    await expect(
      discoverLocalTransport(
        client([]),
        "livekit",
        {},
        fromBackends([bobsTransport, carolsTransport]),
        logger,
      ),
    ).resolves.toEqual(bobsTransport);
  });

  it("fails naming the homeserver where there is no transport at all", async () => {
    const promise = discoverLocalTransport(
      client([]),
      "livekit",
      {},
      fromBackends(),
      logger,
    );

    await expect(promise).rejects.toBeInstanceOf(
      MatrixRTCTransportMissingError,
    );
    await expect(promise).rejects.toHaveProperty("domain", "example.org");
  });
});

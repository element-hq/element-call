/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/lib/logger";
import { type Transport } from "matrix-js-sdk/lib/matrixrtc";
import { describe, expect, it, vi } from "vitest";

import { MatrixRTCTransportMissingError } from "../errors";
import { mockRtcMembership } from "../utils/test";
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
const bob = mockRtcMembership("@bob:bob.com", "BOB");

function client(
  advertised: Transport[],
): Parameters<typeof discoverLocalTransport>[0] {
  return {
    getDomain: () => "example.org",
    _unstable_getRTCTransports: vi.fn().mockResolvedValue(advertised),
  };
}

function backend(
  remote: Transport | null = null,
): Parameters<typeof discoverLocalTransport>[1] {
  return {
    transportType: "livekit",
    findRemotePublishTransport: vi.fn().mockResolvedValue(remote),
  };
}

describe("discoverLocalTransport", () => {
  it("takes the transport the host names without asking the homeserver", async () => {
    const c = client([homeserverTransport]);

    await expect(
      discoverLocalTransport(
        c,
        backend(),
        [],
        { transport: hostTransport },
        logger,
      ),
    ).resolves.toBe(hostTransport);
    expect(c._unstable_getRTCTransports).not.toHaveBeenCalled();
  });

  it("prefers the homeserver's transport over the host's fallback", async () => {
    await expect(
      discoverLocalTransport(
        client([homeserverTransport]),
        backend(),
        [],
        { fallbackTransport: hostTransport },
        logger,
      ),
    ).resolves.toEqual(homeserverTransport);
  });

  it("falls back to the host's transport where the homeserver advertises none of the type", async () => {
    await expect(
      discoverLocalTransport(
        client([{ type: "not_livekit" }]),
        backend(),
        [],
        { fallbackTransport: hostTransport },
        logger,
      ),
    ).resolves.toEqual(hostTransport);
  });

  it("prefers a local transport over other members' SFUs", async () => {
    const b = backend(bobsTransport);

    await expect(
      discoverLocalTransport(
        client([homeserverTransport]),
        b,
        [bob],
        {},
        logger,
      ),
    ).resolves.toEqual(homeserverTransport);
    expect(b.findRemotePublishTransport).not.toHaveBeenCalled();
  });

  it("publishes on another member's SFU where there is no local transport", async () => {
    const b = backend(bobsTransport);

    await expect(
      discoverLocalTransport(client([]), b, [bob], {}, logger),
    ).resolves.toEqual(bobsTransport);
    expect(b.findRemotePublishTransport).toHaveBeenCalledWith([bob]);
  });

  it("fails naming the homeserver where there is no transport at all", async () => {
    const promise = discoverLocalTransport(
      client([]),
      backend(),
      [bob],
      {},
      logger,
    );

    await expect(promise).rejects.toBeInstanceOf(
      MatrixRTCTransportMissingError,
    );
    await expect(promise).rejects.toHaveProperty("domain", "example.org");
  });
});

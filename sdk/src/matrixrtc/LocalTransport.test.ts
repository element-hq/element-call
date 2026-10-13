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

function client(
  advertised: Transport[],
): Parameters<typeof discoverLocalTransport>[0] {
  return {
    getDomain: () => "example.org",
    _unstable_getRTCTransports: vi.fn().mockResolvedValue(advertised),
  };
}

describe("discoverLocalTransport", () => {
  it("takes the transport the host names without asking the homeserver", async () => {
    const c = client([homeserverTransport]);

    await expect(
      discoverLocalTransport(
        c,
        "livekit",
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
        "livekit",
        { fallbackTransport: hostTransport },
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
        logger,
      ),
    ).resolves.toEqual(hostTransport);
  });

  it("fails naming the homeserver where there is no transport at all", async () => {
    const promise = discoverLocalTransport(client([]), "livekit", {}, logger);

    await expect(promise).rejects.toBeInstanceOf(
      MatrixRTCTransportMissingError,
    );
    await expect(promise).rejects.toHaveProperty("domain", "example.org");
  });
});

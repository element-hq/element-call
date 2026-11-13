/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prefetchSounds } from "./soundUtils";

const bytesOf = (buffer: ArrayBuffer): number[] => [...new Uint8Array(buffer)];

describe("prefetchSounds", () => {
  const fetchSpy = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchSpy.mockReset();
  });

  it("fetches sounds given as ordinary URLs", async () => {
    fetchSpy.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    );
    const sounds = await prefetchSounds({
      beep: { ogg: "https://example.org/beep.ogg" },
    });
    expect(fetchSpy).toHaveBeenCalledWith("https://example.org/beep.ogg");
    expect(bytesOf(sounds.beep)).toEqual([1, 2, 3]);
  });

  it("leaves out a sound whose response is not okay", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 404 }));
    const sounds = await prefetchSounds({
      beep: { ogg: "https://example.org/missing.ogg" },
    });
    expect(sounds).toEqual({});
  });

  it("leaves out a sound that fails to load, keeping the others", async () => {
    // Fetched in the order given
    fetchSpy
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
      );
    const sounds = await prefetchSounds({
      beep: { ogg: "https://example.org/beep.ogg" },
      boop: { ogg: "https://example.org/boop.ogg" },
    });
    expect(Object.keys(sounds)).toEqual(["boop"]);
  });
});

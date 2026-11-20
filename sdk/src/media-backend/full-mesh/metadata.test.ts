/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { parseConsumptionMetadata, parseTrackMetadata } from "./metadata";

describe("parseTrackMetadata", () => {
  it("keeps the well-formed entries", () => {
    expect(
      parseTrackMetadata({
        "0": { purpose: "m.usermedia", muted: true, extra: 1 },
        "1": { purpose: "m.screenshare", muted: "yes" },
        "2": { muted: true },
        "3": [],
      }),
    ).toEqual({
      "0": { purpose: "m.usermedia", muted: true },
      "1": { purpose: "m.screenshare" },
    });
  });

  it("rejects what isn't metadata at all", () => {
    expect(parseTrackMetadata("x")).toBeNull();
    expect(parseTrackMetadata([])).toBeNull();
  });

  it("reads no more entries than any member publishes", () => {
    const many = Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [i, { purpose: "m.usermedia" }]),
    );
    expect(Object.keys(parseTrackMetadata(many)!)).toHaveLength(64);
  });
});

describe("parseConsumptionMetadata", () => {
  it("bounds the sizes to what makes sense", () => {
    expect(
      parseConsumptionMetadata({
        "0": { in_use: false, max_width: 1e9, max_height: -1 },
        "1": { max_width: 320.4, max_height: Number.NaN },
      }),
    ).toEqual({
      "0": { in_use: false, max_width: 16_384 },
      "1": { max_width: 320 },
    });
  });
});

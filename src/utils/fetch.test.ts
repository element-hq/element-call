/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, describe, it } from "vitest";

import { isFailure } from "./fetch";

describe("isFailure", () => {
  it("returns false for a successful response", () => {
    expect(isFailure({ ok: true, url: "https://foo.com" } as Response)).toBe(
      false,
    );
  });

  it("returns true for a failed response", () => {
    expect(isFailure({ ok: false, url: "https://foo.com" } as Response)).toBe(
      true,
    );
  });

  it("returns false for a file:// URL with status 0", () => {
    expect(
      isFailure({ ok: false, url: "file://foo", status: 0 } as Response),
    ).toBe(false);
  });
});

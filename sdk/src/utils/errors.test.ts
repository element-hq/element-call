/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { RtcSessionError } from "../api";
import { toRtcSessionError } from "./errors";

describe("toRtcSessionError", () => {
  it("keeps an RtcSessionError as it is", () => {
    const error = new RtcSessionError("gone");
    expect(toRtcSessionError(error)).toBe(error);
  });

  it("wraps another error as the cause", () => {
    const cause = new Error("boom");
    const error = toRtcSessionError(cause);
    expect(error).toBeInstanceOf(RtcSessionError);
    expect(error.message).toBe("boom");
    expect(error.cause).toBe(cause);
  });

  it("falls back to the code of an error without a message", () => {
    const cause = Object.assign(new Error(""), { code: "SFU_ERROR" });
    expect(toRtcSessionError(cause).message).toBe("SFU_ERROR");
  });

  it("stringifies anything else", () => {
    expect(toRtcSessionError("nope").message).toBe("nope");
  });
});

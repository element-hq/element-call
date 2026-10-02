/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { MatrixRTCError } from "../api";
import { toMatrixRTCError } from "./errors";

describe("toMatrixRTCError", () => {
  it("keeps an MatrixRTCError as it is", () => {
    const error = new MatrixRTCError("gone");
    expect(toMatrixRTCError(error)).toBe(error);
  });

  it("wraps another error as the cause", () => {
    const cause = new Error("boom");
    const error = toMatrixRTCError(cause);
    expect(error).toBeInstanceOf(MatrixRTCError);
    expect(error.message).toBe("boom");
    expect(error.cause).toBe(cause);
  });

  it("falls back to the code of an error without a message", () => {
    const cause = Object.assign(new Error(""), { code: "SFU_ERROR" });
    expect(toMatrixRTCError(cause).message).toBe("SFU_ERROR");
  });

  it("stringifies anything else", () => {
    expect(toMatrixRTCError("nope").message).toBe("nope");
  });
});

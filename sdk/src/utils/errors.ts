/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { MatrixRTCError } from "../api";

/** Wraps whatever a backend threw into the SDK's error type, keeping it as the cause. */
export function toMatrixRTCError(error: unknown): MatrixRTCError {
  if (error instanceof MatrixRTCError) return error;
  if (error instanceof Error)
    return new MatrixRTCError(messageOf(error), { cause: error });
  return new MatrixRTCError(String(error));
}

/**
 * Element Call's errors carry a translated title as their message, which is
 * empty where no translations are loaded; their code says what went wrong
 * regardless.
 */
function messageOf(error: Error): string {
  if (error.message !== "") return error.message;
  if ("code" in error && typeof error.code === "string") return error.code;
  return error.name;
}

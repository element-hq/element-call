/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Transport } from "matrix-js-sdk/lib/matrixrtc";

/** The homeserver a Matrix user id belongs to: everything after the first colon. */
export function serverNameOf(userId: string): string {
  return userId.replace(/^.*?:/, "");
}

/**
 * The homeserver that operates a transport: the one the transport names, else
 * the one of the member advertising it. A member publishing on another
 * homeserver's SFU (MSC4195) names that homeserver in `server_name`.
 */
export function serverNameOfTransport(
  transport: Transport,
  userId: string,
): string {
  return typeof transport.server_name === "string"
    ? transport.server_name
    : serverNameOf(userId);
}

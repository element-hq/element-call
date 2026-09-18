/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The MatrixRTC half of what a host supplies: the `matrix-rtc` crate's own
 * driver contract, taken verbatim from its bindings. Everything MatrixRTC —
 * sticky and delayed events, to-device key delivery, transport tokens, the
 * inbound event sinks and homeserver connectivity — goes through this and
 * is consumed by the crate, never by Element Call directly.
 *
 * What a call needs from a Matrix client beyond MatrixRTC is the separate
 * {@link ElementCallMatrixClientDriver}.
 */

import { type MatrixDriverCallback } from "../matrix-rtc-sdk";

export type RtcMatrixDriver = MatrixDriverCallback;

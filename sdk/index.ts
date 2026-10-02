/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * EXPERIMENTAL
 *
 * MatrixRTC sessions with LiveKit media, without Element Call's UI: the call
 * model Element Call's own view model is built on, for hosts that want to
 * build a different one. The design and the migration from Element Call's
 * `CallViewModel` are in `sdk-plan.md` at the repository root.
 */

// Shared with Element Call. They live in `src` until the view model consumes
// the SDK, at which point they move here; a consumer gets them from this
// module either way.
export { type Behavior, constant } from "../src/state/Behavior";
export { ObservableScope } from "../src/state/ObservableScope";
export { E2eeType } from "../src/e2ee/e2eeType";
export { type EncryptionSystem } from "../src/e2ee/sharedKeyManagement";
export { MatrixRTCMode } from "../src/config/ConfigOptions";

export * from "./src/api";
export { createMatrixRTCClient } from "./src/session/MatrixRTCClient";

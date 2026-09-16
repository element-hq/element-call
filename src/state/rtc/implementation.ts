/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Config } from "../../config/Config";
import { CallViewModelImplementation } from "../../config/ConfigOptions";
import { callViewModelImplementation } from "../../settings/settings";

/**
 * Which implementation carries the call right now: the deployment's pin in
 * `config.json` when there is one, else the user's Developer Settings
 * choice. Read when the call view mounts; a change takes effect on the next
 * call.
 */
export function effectiveCallViewModelImplementation(): CallViewModelImplementation {
  return (
    Config.get().call_view_model_implementation ??
    callViewModelImplementation.value$.value
  );
}

/** Whether the Rust `matrix-rtc` crate carries the call. */
export function usesMatrixRtc(): boolean {
  return (
    effectiveCallViewModelImplementation() ===
    CallViewModelImplementation.MatrixRtc
  );
}

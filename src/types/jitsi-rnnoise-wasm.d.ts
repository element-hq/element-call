/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

declare module "@jitsi/rnnoise-wasm/dist/rnnoise-sync.js" {
  const createRNNWasmModuleSync: () => unknown;

  export default createRNNWasmModuleSync;
}

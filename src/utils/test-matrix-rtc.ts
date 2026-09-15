/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { initMatrixRtcSdk } from "../matrix-rtc-sdk";

/**
 * Loads the MatrixRTC SDK for a unit test. The browser builds fetch the wasm
 * by URL; under vitest there is no server, so the bytes come from disk.
 *
 * Only suites that construct a participation manager need this; do not put
 * it in the global setup, where every test file would pay for the boot.
 */
export async function initMatrixRtcSdkForTests(): Promise<void> {
  // Relative to this file: under the jsdom environment `import.meta.url` is
  // not a file URL and `process.cwd()` is not the repository, but vitest
  // still provides `__dirname`.
  const wasm = readFileSync(
    resolve(
      __dirname,
      "../matrix-rtc-sdk/generated/wasm-bindgen/index_bg.wasm",
    ),
  );
  await initMatrixRtcSdk(wasm);
}

/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { initMatrixRtcSdk } from "../matrix-rtc-sdk";

/**
 * Loads the MatrixRTC SDK for a unit test. The browser builds fetch the wasm
 * by URL; under vitest there is no server, so the bytes come from disk: the
 * `.wasm` the installed package exports as `@element-hq/matrix-rtc/wasm`.
 *
 * Only suites that construct a participation manager need this; do not put
 * it in the global setup, where every test file would pay for the boot.
 */
export async function initMatrixRtcSdkForTests(): Promise<void> {
  // Resolved from this file's directory: under the jsdom environment
  // `import.meta.url` is not a file URL and `process.cwd()` is not the
  // repository, but vitest still provides `__dirname`.
  const wasm = createRequire(join(__dirname, "test-matrix-rtc.ts")).resolve(
    "@element-hq/matrix-rtc/wasm",
  );
  await initMatrixRtcSdk(readFileSync(wasm));
}

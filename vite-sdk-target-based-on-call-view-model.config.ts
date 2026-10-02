/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import nodePolyfills from "vite-plugin-node-stdlib-browser";

// Config for the legacy SDK bundle that predates the sdk/ package: a single
// bundle of Element Call's CallViewModel for a plain web page or widget. It is
// in production use, so it keeps building on top of the sdk/ package until its
// consumers have moved to that package directly.
export default defineConfig(() => ({
  worker: { format: "es" as const },
  resolve: {
    alias: {
      // The SDK by its package name, resolved to its source, like the app does
      "@element-hq/matrixrtc-sdk": fileURLToPath(
        new URL("./sdk/index.ts", import.meta.url),
      ),
    },
  },
  // Relative URLs, so the bundle can be hosted under any path
  base: "./",
  // Otherwise the developer's own config.json in `public` is copied into the output
  publicDir: false,
  build: {
    outDir: "sdk-target-based-on-call-view-model/dist",
    sourcemap: true,
    manifest: true,
    lib: {
      formats: ["es" as const],
      entry: "./sdk-target-based-on-call-view-model/main.ts",
      name: "MatrixrtcSdk",
      fileName: "matrixrtc-sdk",
    },
  },
  plugins: [nodePolyfills()],
}));

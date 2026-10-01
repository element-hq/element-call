/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { defineConfig } from "vite";
import nodePolyfills from "vite-plugin-node-stdlib-browser";

// Config for the SDK demo that predates the sdk/ package: a single bundle of
// Element Call's CallViewModel for a plain web page or widget. Kept building
// until the harness in sdk/dev replaces it (see sdk-plan.md).
export default defineConfig(() => ({
  worker: { format: "es" as const },
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

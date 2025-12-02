/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { defineConfig, mergeConfig } from "vite";
import nodePolyfills from "vite-plugin-node-stdlib-browser";

const base = "./";

// Config for embedded deployments (possibly hosted under a non-root path)
export default defineConfig(() =>
  mergeConfig(
    defineConfig({
      worker: { format: "es" },
      base, // Use relative URLs to allow the app to be hosted under any path
      build: {
        sourcemap: true,
        manifest: true,
        lib: {
          formats: ["es"],
          entry: "./sdk/main.ts",
          name: "MatrixrtcSdk",
          fileName: "matrixrtc-sdk",
        },
      },
      plugins: [nodePolyfills()],
    }),
  ),
);

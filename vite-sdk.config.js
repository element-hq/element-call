/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { defineConfig, mergeConfig } from "vite";
import fullConfig from "./vite.config";

const base = "./";

// Config for embedded deployments (possibly hosted under a non-root path)
export default defineConfig((env) =>
  mergeConfig(
    fullConfig({ ...env, packageType: "sdk" }),
    defineConfig({
      base, // Use relative URLs to allow the app to be hosted under any path
      // publicDir: false, // Don't serve the public directory which only contains the favicon
      build: {
        manifest: true,
        lib: {
          entry: "./sdk/main.ts",
          name: "matrixrtc-sdk",
          // the proper extensions will be added
          fileName: "matrixrtc-sdk",
        },
      },
    }),
  ),
);

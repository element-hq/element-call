/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import nodePolyfills from "vite-plugin-node-stdlib-browser";

import { withoutMatrixCrypto } from "./vite.config.ts";

// Config for the widget RTC SDK: a single bundle that wraps the sdk/ package for
// a widget page. CI deploys it as the `pr<N>-widget-rtc-sdk` Netlify preview.
export default defineConfig(({ mode }) => ({
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
    // Optimised for production (`build:widget-rtc-sdk:production`): minified and
    // without source maps, which nothing uploads for this bundle. Readable in
    // development.
    minify: mode === "production",
    sourcemap: mode !== "production",
    manifest: true,
    lib: {
      formats: ["es" as const],
      entry: "./widget-rtc-sdk/main.ts",
      name: "WidgetRtcSdk",
      fileName: "widget-rtc-sdk",
    },
  },
  plugins: [nodePolyfills(), withoutMatrixCrypto()],
}));

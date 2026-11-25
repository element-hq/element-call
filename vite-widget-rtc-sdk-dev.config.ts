/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { defineConfig, searchForWorkspaceRoot } from "vite";
import { realpathSync } from "node:fs";
import * as fs from "node:fs";

import { vitePluginsConfig, withoutMatrixCrypto } from "./vite.config.ts";

// Serves the widget RTC SDK's example widget, `widget-rtc-sdk/index.html`, with
// its import of a deployed bundle pointed at the source instead, so that a host
// can open the example as a widget against the code in the tree. The shape of
// the SDK's development config.
//
// `vite build` and `vite preview` with this config serve the example bundled,
// which the e2e tests use: unbundled, the page is hundreds of module requests,
// on which Firefox now and then stalls.
export default defineConfig(({ mode }) => {
  const allow = [searchForWorkspaceRoot(process.cwd())];
  for (const path of [
    "node_modules/matrix-js-sdk/node_modules/@matrix-org/matrix-sdk-crypto-wasm",
    "node_modules/@matrix-org/matrix-sdk-crypto-wasm",
  ]) {
    try {
      allow.push(realpathSync(path));
    } catch {}
  }

  const base = vitePluginsConfig({ mode, html: false });
  return {
    ...base,
    root: "widget-rtc-sdk",
    publicDir: false,
    plugins: [
      ...(base.plugins ?? []),
      // As in the bundle itself (vite-widget-rtc-sdk.config.ts)
      withoutMatrixCrypto(),
      {
        name: "widget-rtc-sdk-from-source",
        transformIndexHtml: {
          order: "pre" as const,
          handler: (html: string): string =>
            html.replace(
              /https:\/\/pr\d+-widget-rtc-sdk--element-call\.netlify\.app\/widget-rtc-sdk\.js/,
              "/main.ts",
            ),
        },
      },
    ],
    server: {
      host: true,
      // After the app (3000), the component harness (3001) and the SDK harness
      // (3002), so that all of them can run at once
      port: 3003,
      strictPort: true,
      fs: { allow },
      // The same certificate the app uses, which Element Web's pages trust
      https: {
        key: fs.readFileSync("./backend/dev_tls_m.localhost.key"),
        cert: fs.readFileSync("./backend/dev_tls_m.localhost.crt"),
      },
    },
    // The e2e tests' copy, out of the way of `pnpm build:widget-rtc-sdk`'s
    build: { outDir: "../dist-widget-rtc-sdk-example", emptyOutDir: true },
    preview: { port: 3003, strictPort: true },
    worker: {
      format: "es" as const,
    },
  };
});

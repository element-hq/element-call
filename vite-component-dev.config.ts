/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { defineConfig, searchForWorkspaceRoot } from "vite";
import { realpathSync } from "node:fs";
import * as fs from "node:fs";

import { vitePluginsConfig } from "./vite.config";

// Serves the harness under `component/dev`, which embeds Element Call as a
// component the way a host application would. Development only: this is not
// something we build or ship.
//
// It shares the plugins with the standalone app but not its HTML entry point,
// since the harness has a page of its own — and it deliberately does not build
// on the app's config, which would also bring the app's build output along.
export default defineConfig(({ mode }) => {
  // The crypto WASM module is imported dynamically, so Vite has to be told
  // that reading it is legitimate — including from a linked copy, which is why
  // the paths are resolved rather than assumed. Same as the standalone app.
  const allow = [searchForWorkspaceRoot(process.cwd())];
  for (const path of [
    "node_modules/matrix-js-sdk/node_modules/@matrix-org/matrix-sdk-crypto-wasm",
    "node_modules/@matrix-org/matrix-sdk-crypto-wasm",
  ]) {
    try {
      allow.push(realpathSync(path));
    } catch {}
  }

  return {
    ...vitePluginsConfig({ mode, html: false }),
    root: "component/dev",
    // So that the harness can read the same config.json the standalone app
    // does, if the developer has written one
    publicDir: "../../public",
    server: {
      host: true,
      // One up from the standalone app's, so both can run at once — the point
      // of the harness is to compare them
      port: 3001,
      fs: { allow },
      // The same certificate the app uses, so that the harness is served from
      // a `m.localhost` name the development homeserver's certificate covers
      https: {
        key: fs.readFileSync("./backend/dev_tls_m.localhost.key"),
        cert: fs.readFileSync("./backend/dev_tls_m.localhost.crt"),
      },
    },
    worker: {
      format: "es",
    },
    resolve: {
      alias: {
        // matrix-widget-api has its transpiled lib/index.js as its entry point,
        // which Vite for some reason refuses to work with, so we point it to
        // src/index.ts instead
        "matrix-widget-api": "matrix-widget-api/src/index.ts",
      },
      dedupe: [
        "react",
        "react-dom",
        "matrix-js-sdk",
        "react-use-measure",
        // These packages modify the document based on some module-level global
        // state, and don't play nicely with duplicate copies of themselves
        // https://github.com/radix-ui/primitives/issues/1241#issuecomment-1847837850
        "@radix-ui/react-focus-guards",
        "@radix-ui/react-dismissable-layer",
      ],
    },
  };
});

/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { defineConfig, searchForWorkspaceRoot } from "vite";
import { realpathSync } from "node:fs";
import * as fs from "node:fs";

import { vitePluginsConfig } from "./vite.config.ts";

// Serves the SDK's development harness, `sdk/dev`: a page that uses the SDK as a
// host would, and nothing of Element Call. The shape of the component's
// development config, without the styles.
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

  return {
    ...vitePluginsConfig({ mode, html: false }),
    root: "sdk/dev",
    publicDir: false,
    server: {
      host: true,
      // After the app (3000) and the component harness (3001), so all three can
      // run at once
      port: 3002,
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
  };
});

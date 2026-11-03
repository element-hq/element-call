/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { defineConfig } from "vite";

import { vitePluginsConfig } from "./vite.config.ts";

// Config for the MatrixRTC SDK, a library a host imports rather than a page.
// The shape of the component build (vite-component.config.ts) without
// anything to do with styles or React.
export default defineConfig(({ mode }) => {
  const base = vitePluginsConfig({ mode, html: false });
  return {
    ...base,
    // A library has no public directory to serve
    publicDir: false,
    build: {
      // Into the package directory, so that `sdk/package.json` describes what
      // sits next to it and the directory can be installed as a package
      outDir: "sdk/dist",
      minify: mode === "production",
      sourcemap: true,
      lib: {
        formats: ["es" as const],
        entry: { "matrixrtc-sdk": "./sdk/index.ts" },
        fileName: (_format, entryName) => `${entryName}.js`,
      },
      rollupOptions: {
        // The host already has these, and a second copy of any of them is worse
        // than dead weight: the Matrix client would run two sync loops, and a
        // second LiveKit or RxJS would not share state with the host's. Every
        // subpath has to be named (see vite-component.config.ts for why), and
        // `pnpm lint:externals` fails if the source imports one this list
        // misses.
        external: [
          "livekit-client",
          "matrix-js-sdk",
          "matrix-js-sdk/lib/@types/event",
          "matrix-js-sdk/lib/browser-index",
          "matrix-js-sdk/lib/client",
          "matrix-js-sdk/lib/crypto-api",
          "matrix-js-sdk/lib/indexeddb-worker",
          "matrix-js-sdk/lib/logger",
          "matrix-js-sdk/lib/matrix",
          "matrix-js-sdk/lib/matrixrtc",
          "matrix-js-sdk/lib/matrixrtc/EncryptionManager",
          "matrix-js-sdk/lib/matrixrtc/IKeyTransport",
          "matrix-js-sdk/lib/matrixrtc/IMembershipManager",
          "matrix-js-sdk/lib/models/event",
          "matrix-js-sdk/lib/models/relations-container",
          "matrix-js-sdk/lib/models/room",
          "matrix-js-sdk/lib/models/room-state",
          "matrix-js-sdk/lib/models/typed-event-emitter",
          "matrix-js-sdk/lib/randomstring",
          "matrix-js-sdk/lib/sync",
          "matrix-js-sdk/lib/types",
          "matrix-js-sdk/lib/utils",
          "rxjs",
          "rxjs/testing",
        ],
      },
    },
  };
});

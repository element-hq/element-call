/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { defineConfig } from "vite";

import { vitePluginsConfig } from "./vite.config";
import { scopeStylesToRoot } from "./component/build/scopeStylesToRoot";

// Config for Element Call as a React component, to be imported by an
// application embedding it rather than served as a page of its own.
//
// Deliberately not built on top of the full app's config, which exists to
// produce a page and brings an HTML entry point along with it.
export default defineConfig(({ mode }) => {
  const base = vitePluginsConfig({ mode, html: false });
  return {
    ...base,
    resolve: {
      ...base.resolve,
      alias: {
        ...base.resolve?.alias,
        // react-i18next depends on the CommonJS `use-sync-external-store/shim`, whose
        // `require("react")` cannot be bundled against an external React: rolldown leaves a
        // `require` shim that throws in the browser. React 18+ provides `useSyncExternalStore`
        // itself, so point the shim at React.
        "use-sync-external-store/shim": "react",
      },
    },
    // A library has no public directory to serve. Without this the build copies
    // whatever is in `public` — including the developer's own config.json, which
    // is not in the repository — into the output we would publish.
    publicDir: false,
    // A host's document is not ours to style: everything in the stylesheet is
    // confined to the element Element Call is mounted in
    css: { postcss: { plugins: [scopeStylesToRoot()] } },
    build: {
      // Into the package directory, so that `component/package.json` describes
      // what sits next to it and the directory can be installed as a package
      // (see its `files` and `exports`).
      outDir: "component/dist",
      minify: mode === "production",
      sourcemap: true,
      // One stylesheet rather than one per chunk, so a host has a single file to
      // include
      cssCodeSplit: false,
      lib: {
        formats: ["es" as const],
        entry: "./component/index.tsx",
        fileName: "element-call",
      },
      rollupOptions: {
        // The host already has these, and a second copy of any of them does not
        // merely bloat the bundle: React would hold two sets of hooks, and the
        // Matrix client would run two sync loops.
        //
        // Every subpath has to be named. Element Call reaches most of the Matrix
        // SDK as `matrix-js-sdk/lib/…`, and a bare "matrix-js-sdk" would not
        // catch those — while the pattern and callback forms of this option are
        // silently ignored by the bundler, so they cannot be used to cover them.
        // `pnpm lint:externals` reads this list and fails if the source imports
        // one of these packages by a path it does not name; a few entries below
        // are there only because the standalone app imports them, which costs
        // nothing.
        external: [
          "react",
          "react/jsx-runtime",
          // Emitted by the React Compiler for every compiled component; part of React, so it must be
          // the host's copy too (bundled, its CommonJS `require("react")` throws in the browser).
          "react/compiler-runtime",
          "react-dom",
          "react-dom/client",
          "livekit-client",
          "matrix-js-sdk",
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
          "matrix-js-sdk/lib/models/relations-container",
          "matrix-js-sdk/lib/models/room",
          "matrix-js-sdk/lib/models/typed-event-emitter",
          "matrix-js-sdk/lib/randomstring",
          "matrix-js-sdk/lib/sync",
          "matrix-js-sdk/lib/types",
          "matrix-js-sdk/lib/utils",
        ],
      },
    },
  };
});

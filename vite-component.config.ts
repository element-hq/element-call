/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { defineConfig } from "vite";
import { posix } from "node:path";

import { vitePluginsConfig, withoutMatrixCrypto } from "./vite.config.ts";
import { scopeStylesToRoot } from "./component/build/scopeStylesToRoot.ts";

// Config for Element Call as a React component, to be imported by an
// application embedding it rather than served as a page of its own.
//
// Deliberately not built on top of the full app's config, which exists to
// produce a page and brings an HTML entry point along with it.
export default defineConfig(({ mode }) => {
  const base = vitePluginsConfig({ mode, html: false });
  return {
    ...base,
    plugins: [...(base.plugins ?? []), withoutMatrixCrypto()],
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
    // A library does not know where it will be served from, so every file it
    // emits beside itself — the sounds, the pictures, MediaPipe's runtime — is
    // referenced relative to the module's own URL. (A library build inlines
    // each asset as a data URL unless its import says `no-inline`, so the
    // imports do.)
    base: "./",
    experimental: {
      // Relative to the chunk that references it, wherever that chunk lands,
      // and spelled `./assets/…` rather than `assets/…`: a host's bundler reads
      // a bare name as a package to look up.
      renderBuiltUrl: (filename, { hostId, hostType }) => {
        if (hostType !== "js") return { relative: true };
        const relative = posix.relative(posix.dirname(hostId), filename);
        const specifier = relative.startsWith(".") ? relative : `./${relative}`;
        return {
          runtime: `new URL(${JSON.stringify(specifier)}, import.meta.url).href`,
        };
      },
    },
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
        entry: {
          // The component
          "element-call": "./component/index.tsx",
          // What a host needs to talk about it, without it (see component/api.ts).
          // Built as an entry point of its own so that importing it does not
          // load the component: the bundler gives it a chunk that reaches only
          // what it imports.
          api: "./component/api.ts",
        },
        fileName: (_format, entryName) => `${entryName}.js`,
        // The one stylesheet (see cssCodeSplit) keeps the name it had when the
        // component was the only entry
        cssFileName: "element-call",
      },
      rollupOptions: {
        output: {
          // Hashed, as the app's are, so that a file a host serves as it is
          // stays correct across versions of the package. Not the stylesheet,
          // which the package exports by name (see `cssFileName`).
          assetFileNames: ({ names }) =>
            names.some((name) => name.endsWith(".css"))
              ? "[name][extname]"
              : "assets/[name]-[hash][extname]",
        },
        // The host already has these, and a second copy of any of them does not
        // merely bloat the bundle: React would hold two sets of hooks, and a
        // second Compound would bring a second stylesheet with class names of
        // its own — so that what it floats into the host's body, tooltips and
        // menus, would match the host's Compound stylesheet only when the two
        // happened to be the same version.
        //
        // The Matrix SDK is not among them: the component bundles its own, so
        // that a host on an older or newer js-sdk still gets the MatrixRTC
        // implementation Element Call was built against. It only ever wraps the
        // host's client (see component/componentLocalJsClient.ts) and never
        // starts a client, sync loop or crypto of its own.
        //
        // Every subpath has to be named, while the pattern and callback forms of
        // this option are silently ignored by the bundler. `pnpm lint:externals`
        // reads this list and fails if the source imports one of these packages
        // by a path it does not name.
        external: [
          "react",
          "react/jsx-runtime",
          // Emitted by the React Compiler for every compiled component; part of React, so it must be
          // the host's copy too (bundled, its CommonJS `require("react")` throws in the browser).
          "react/compiler-runtime",
          "react-dom",
          "react-dom/client",
          "@vector-im/compound-web",
          "@vector-im/compound-design-tokens/assets/web/icons",
        ],
      },
    },
  };
});

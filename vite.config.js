/*
Copyright 2021 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { defineConfig, loadEnv } from "vite";
import svgrPlugin from "vite-plugin-svgr";
import htmlTemplate from "vite-plugin-html-template";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());

  const plugins = [
    react(),
    basicSsl(),
    svgrPlugin({
      svgrOptions: {
        // This enables ref forwarding on SVGR components, which is needed, for
        // example, to make tooltips on icons work
        ref: true,
      },
    }),
    htmlTemplate.default({
      data: {
        title: env.VITE_PRODUCT_NAME || "Element Call",
      },
    }),
  ];

  if (
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT &&
    process.env.SENTRY_AUTH_TOKEN &&
    process.env.SENTRY_URL
  ) {
    plugins.push(
      sentryVitePlugin({
        include: "./dist",
        release: process.env.VITE_APP_VERSION,
      }),
    );
  }

  return {
    server: {
      port: 3000,
    },
    build: {
      rollupOptions: { external: "grecaptcha" },
      sourcemap: true,
    },
    plugins,
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
        "@juggle/resize-observer",
        // These packages modify the document based on some module-level global
        // state, and don't play nicely with duplicate copies of themselves
        // https://github.com/radix-ui/primitives/issues/1241#issuecomment-1847837850
        "@radix-ui/react-focus-guards",
        "@radix-ui/react-dismissable-layer",
      ],
    },
  };
});

/*
Copyright 2024 New Vector Ltd.
SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config";

export default defineConfig((configEnv) =>
  mergeConfig(
    viteConfig(configEnv),
    defineConfig({
      test: {
        environment: "jsdom",
        css: {
          modules: {
            classNameStrategy: "non-scoped",
          },
        },
        setupFiles: ["src/vitest.setup.ts"],
        include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
        coverage: {
          reporter: ["html", "json"],
          include: ["src/"],
          exclude: [
            "src/**/*.{d,test}.{ts,tsx}",
            "src/utils/test.ts",
            "src/utils/test-viewmodel.ts",
            "src/utils/test-fixtures.ts",
            "playwright/**",
          ],
        },
      },
    }),
  ),
);

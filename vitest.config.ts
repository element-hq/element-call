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
        setupFiles: ["vitest.setup.ts"],
        include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
        coverage: {
          reporter: ["html", "json"],
          include: ["src/**/*.{ts,tsx,js,jsx}"],
          exclude: [
            "src/**/*.md",
            "src/**/*.{d,test,stories}.{ts,tsx}",
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

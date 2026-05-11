import { defineConfig, mergeConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { vitePluginsConfig } from "./vite.config";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig((configEnv) =>
  mergeConfig(
    vitePluginsConfig(configEnv),
    defineConfig({
      test: {
        projects: [
          {
            extends: true,
            test: {
              css: {
                modules: {
                  classNameStrategy: "non-scoped",
                },
              },
              setupFiles: ["src/vitest.setup.ts"],
              environment: "jsdom",
              // an example of file based convention,
              // you don't have to follow it
              include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
              name: "unit",
            },
          },
          {
            plugins: [
              storybookTest({
                // The location of your Storybook config, main.js|ts
                configDir: path.join(dirname, ".storybook"),
              }),
              ...vitePluginsConfig(configEnv).plugins!,
            ],
            test: {
              name: "storybook",
              // setupFiles: [".storybook/vitest.setup.ts"],
              browser: {
                enabled: true,
                // Make sure to install Playwright
                provider: playwright(),
                headless: true,
                instances: [{ browser: "chromium" }],
              },
            },
          },
        ],
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

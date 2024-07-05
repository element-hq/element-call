import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default defineConfig((configEnv) =>
  mergeConfig(
    viteConfig(configEnv),
    defineConfig({
      test: {
        globals: true,
        environment: "jsdom",
        css: {
          modules: {
            classNameStrategy: "non-scoped",
          },
        },
        isolate: false,
        setupFiles: ["src/vitest.setup.ts"],
        coverage: {
          reporter: ["html", "json"],
          include: ["src/"],
        },
      },
    }),
  ),
);

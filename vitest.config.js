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
        include: ["test/**/*-test.[jt]s?(x)"],
        coverage: {
          reporter: ["html", "json"],
          include: ["src/"],
        },
      },
    }),
  ),
);

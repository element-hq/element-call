/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-vitest"],
  framework: "@storybook/react-vite",
  // THIS IS IMPORTANT
  // vitest runs without Vite's normal dependency optimization, so we need to manually include the polyfills for the stories to work.
  // otherwise we will get: new dependencies optimized: ...
  // and
  // ```
  // [vitest] Vite unexpectedly reloaded a test. This may cause tests to fail, lead to flaky behaviour or duplicated test runs.
  // For a stable experience, please add mentioned dependencies to your config's `optimizeDeps.include` field manually.
  // ```
  // which breaks the storybook ci on the first and only run.
  viteFinal(config) {
    config.optimizeDeps = {
      ...config.optimizeDeps,
      include: [
        ...(config.optimizeDeps?.include ?? []),
        "vite-plugin-node-polyfills/shims/buffer",
        "vite-plugin-node-polyfills/shims/global",
        "vite-plugin-node-polyfills/shims/process",
      ],
    };
    return config;
  },
};
export default config;

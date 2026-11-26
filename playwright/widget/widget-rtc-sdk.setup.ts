/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { test as setup } from "@playwright/test";
import { execFileSync } from "node:child_process";

// Into the directory the widget RTC SDK's preview server already serves (see
// playwright.config.ts)
setup("build the widget RTC SDK example", () => {
  setup.setTimeout(10 * 60 * 1000);
  execFileSync(
    "pnpm",
    ["exec", "vite", "build", "--config", "vite-widget-rtc-sdk-dev.config.ts"],
    { stdio: "inherit" },
  );
});

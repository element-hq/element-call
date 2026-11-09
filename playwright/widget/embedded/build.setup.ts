/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { test as setup } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const EMBEDDED_DIST = "embedded/web/dist";

setup("build the embedded package", () => {
  setup.setTimeout(10 * 60 * 1000);
  mkdirSync(EMBEDDED_DIST, { recursive: true });
  execFileSync("pnpm", ["build:embedded", "--outDir", EMBEDDED_DIST], {
    stdio: "inherit",
  });
});

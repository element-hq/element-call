/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { logger } from "matrix-js-sdk/lib/logger";

import { type ConfigOptions, initializeElementCall } from "../index";
import { Harness } from "./Harness";
// After Element Call's, so that the host has the last word on its own page
import "./host.css";

/**
 * The development app's own `config.json`, so that the harness runs Element
 * Call the way `pnpm dev` does. It is not in the repository — developers copy
 * it from `config/config.devenv.json` — so its absence is expected rather than
 * an error.
 */
async function loadConfig(): Promise<ConfigOptions> {
  try {
    const response = await fetch("/config.json");
    if (response.ok) return (await response.json()) as ConfigOptions;
    logger.warn(
      `No config.json (${response.status}); running with Element Call's defaults`,
    );
  } catch (e) {
    logger.warn("Could not read config.json", e);
  }
  return {};
}

await initializeElementCall(await loadConfig());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);

/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/
import "global-jsdom/register";
import globalJsdom from "global-jsdom";
import i18n from "i18next";
import posthog from "posthog-js";
import { initReactI18next } from "react-i18next";
import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { logger } from "matrix-js-sdk/src/logger";

import { Config } from "./config/Config";

// Bare-minimum i18n config
i18n
  .use(initReactI18next)
  .init({
    lng: "en-GB",
    fallbackLng: "en-GB",
    interpolation: {
      escapeValue: false, // React has built-in XSS protections
    },
  })
  .catch((e) => logger.warn("Failed to init i18n for testing", e));

Config.initDefault();
posthog.opt_out_capturing();

// We need to cleanup the global jsDom
// Otherwise we will run into issues with async input test overlapping and throwing.

let cleanupJsDom: { (): void };
beforeEach(() => (cleanupJsDom = globalJsdom()));
afterEach(() => {
  cleanupJsDom();
  cleanup();
});

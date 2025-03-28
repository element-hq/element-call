/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import "global-jsdom/register";
import "@formatjs/intl-durationformat/polyfill";
import "@formatjs/intl-segmenter/polyfill";
import i18n from "i18next";
import posthog from "posthog-js";
import { initReactI18next } from "react-i18next";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "vitest-axe/extend-expect";
import { logger } from "matrix-js-sdk/lib/logger";
import "@testing-library/jest-dom/vitest";

import EN from "../locales/en/app.json";
import { Config } from "./config/Config";

// Bare-minimum i18n config
i18n
  .use(initReactI18next)
  .init({
    lng: "en",
    fallbackLng: "en",
    supportedLngs: ["en"],
    // We embed the translations, so that it never needs to fetch
    resources: {
      en: {
        translation: EN,
      },
    },
    interpolation: {
      escapeValue: false, // React has built-in XSS protections
    },
  })
  .catch((e) => logger.warn("Failed to init i18n for testing", e));

Config.initDefault();
posthog.opt_out_capturing();

afterEach(cleanup);

// Used by a lot of components
window.matchMedia = global.matchMedia = (): MediaQueryList =>
  ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }) as Partial<MediaQueryList> as MediaQueryList;

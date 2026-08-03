/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import "@formatjs/intl-durationformat/polyfill.js";
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

const storage: Record<string, string> = {};
const localStoragePolyfill = {
  getItem(key: string) {
    return Object.prototype.hasOwnProperty.call(storage, key)
      ? storage[key]
      : null;
  },
  setItem(key: string, value: string) {
    storage[key] = String(value);
  },
  removeItem(key: string) {
    delete storage[key];
  },
  clear() {
    for (const key in storage) {
      delete storage[key];
    }
  },
  key(index: number) {
    const keys = Object.keys(storage);
    return keys[index] ?? null;
  },
  get length() {
    return Object.keys(storage).length;
  },
} as unknown as Storage;

if (
  typeof globalThis.localStorage === "undefined" ||
  typeof globalThis.localStorage.clear !== "function"
) {
  Object.defineProperty(globalThis, "localStorage", {
    value: localStoragePolyfill,
    writable: true,
    configurable: true,
  });
}

if (
  typeof window !== "undefined" &&
  (typeof window.localStorage === "undefined" ||
    typeof window.localStorage.clear !== "function")
) {
  Object.defineProperty(window, "localStorage", {
    value: localStoragePolyfill,
    writable: true,
    configurable: true,
  });
}

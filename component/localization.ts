/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Translations for Element Call as a component.
 *
 * The standalone app fetches its locale files at runtime from URLs its own
 * build emits, which a host serving the library from somewhere else could not
 * resolve. The component instead has the bundler split every locale into a
 * chunk of its own, loaded the first time its language is asked for; English,
 * the fallback, is bundled in so that the first paint never waits for it.
 */

import { type BackendModule, type ResourceKey } from "i18next";

import { languageOfLocalePath } from "../src/utils/i18n";

/** Every locale, as a lazily imported module. */
const translations = import.meta.glob<{ default: ResourceKey }>(
  "../locales/*/app.json",
);

/**
 * The languages Element Call can be shown in, as BCP 47 tags — `en`, `de`,
 * `zh-Hans` and so on. A language that is not one of these falls back to its
 * base language where there is one (`de-AT` to `de`), and to English otherwise.
 */
export const supportedLanguages: readonly string[] = [
  ...new Set(Object.keys(translations).map(languageOfLocalePath)),
];

/** Loads translations on demand. */
export const translationsBackend: BackendModule = {
  type: "backend",
  init(): void {},
  read(language: string, namespace: string, callback): void {
    const load = translations[`../locales/${language}/${namespace}.json`];
    if (load === undefined) {
      callback(new Error(`No ${namespace} translations for ${language}`), null);
      return;
    }
    load().then(
      (module) => callback(null, module.default),
      (error: unknown) =>
        callback(
          error instanceof Error ? error : new Error(String(error)),
          null,
        ),
    );
  },
};

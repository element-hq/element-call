/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test } from "vitest";

import { supportedLanguages, translationsBackend } from "./localization";

const read = async (
  language: string,
  namespace = "app",
): Promise<Record<string, unknown>> =>
  await new Promise((resolve, reject) =>
    translationsBackend.read(language, namespace, (error, data) => {
      if (error) reject(error);
      else resolve(data as Record<string, unknown>);
    }),
  );

describe("component translations", () => {
  test("offer every language in locales/, tagged as its directory is", () => {
    expect(supportedLanguages).toContain("en");
    expect(supportedLanguages).toContain("de");
    expect(supportedLanguages).toContain("zh-Hans");
    expect(new Set(supportedLanguages).size).toBe(supportedLanguages.length);
  });

  test("load a language's translations on demand", async () => {
    const de = await read("de");
    expect(de).toHaveProperty("action");
    expect(de).not.toEqual(await read("en"));
  });

  test("refuse a language there are no translations for", async () => {
    await expect(read("xx")).rejects.toThrow("No app translations for xx");
  });

  test("refuse a namespace there are no translations for", async () => {
    await expect(read("en", "other")).rejects.toThrow(
      "No other translations for en",
    );
  });
});

/*
Copyright 2024 New Vector Ltd.
SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import type { UserConfig } from "i18next-parser";

const config: UserConfig = {
  keySeparator: ".",
  namespaceSeparator: false,
  contextSeparator: "|",
  pluralSeparator: "_",
  createOldCatalogs: false,
  defaultNamespace: "app",
  lexers: {
    ts: [
      {
        lexer: "JavascriptLexer",
        functions: ["t", "translatedError"],
        namespaceFunctions: ["useTranslation", "withTranslation"],
      },
    ],
    tsx: [
      {
        lexer: "JsxLexer",
        functions: ["t", "translatedError"],
        namespaceFunctions: ["useTranslation", "withTranslation"],
      },
    ],
  },
  locales: ["en"],
  output: "locales/$LOCALE/$NAMESPACE.json",
  input: ["src/**/*.{ts,tsx}"],
  sort: true,
};

export default config;

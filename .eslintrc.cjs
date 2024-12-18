const COPYRIGHT_HEADER = `/*
Copyright %%CURRENT_YEAR%% New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

`;

module.exports = {
  plugins: ["matrix-org", "rxjs"],
  extends: [
    "plugin:matrix-org/react",
    "plugin:matrix-org/a11y",
    "plugin:matrix-org/typescript",
    "prettier",
    "plugin:rxjs/recommended",
  ],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    project: ["./tsconfig.json"],
  },
  env: {
    browser: true,
    node: true,
  },
  rules: {
    "matrix-org/require-copyright-header": ["error", COPYRIGHT_HEADER],
    "jsx-a11y/media-has-caption": "off",
    // We should use the js-sdk logger, never console directly.
    "no-console": ["error"],
    "react/display-name": "error",
    // Encourage proper usage of Promises:
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-misused-promises": "error",
    "@typescript-eslint/promise-function-async": "error",
    "@typescript-eslint/require-await": "error",
    "@typescript-eslint/await-thenable": "error",
    // To help ensure that we get proper vite/rollup lazy loading (e.g. for matrix-js-sdk):
    "@typescript-eslint/consistent-type-imports": [
      "error",
      { fixStyle: "inline-type-imports" },
    ],
    // To encourage good usage of RxJS:
    "rxjs/no-exposed-subjects": "error",
    "rxjs/finnish": "error",
  },
  settings: {
    react: {
      version: "detect",
    },
  },
};

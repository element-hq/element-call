const COPYRIGHT_HEADER = `/*
Copyright %%CURRENT_YEAR%% New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
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
    "rxjs/finnish": ["error", { names: { "^this$": false } }],
    "no-restricted-imports": [
      "error",
      {
        paths: ["matrix-widget-api", "matrix-js-sdk"].flatMap((lib) =>
          ["src", "src/", "src/index", "lib", "lib/", "lib/index"]
            .map((path) => `${lib}/${path}`)
            .map((name) => ({ name, message: `Please use ${lib} instead` })),
        ),
        patterns: [
          ...["matrix-widget-api"].map((lib) => ({
            group: ["src", "src/", "src/**", "lib", "lib/", "lib/**"].map(
              (path) => `${lib}/${path}`,
            ),
            message: `Please use ${lib} instead`,
          })),
          // XXX: We use /lib in lots of places, so allow for now.
          ...["matrix-js-sdk"].map((lib) => ({
            group: ["src", "src/", "src/**"].map((path) => `${lib}/${path}`),
            message: `Please use ${lib} instead`,
          })),
        ],
      },
    ],
  },
  overrides: [
    {
      files: ["src/*/**"],
      rules: {
        // In application code we should use the js-sdk logger, never console directly.
        "no-console": ["error"],
      },
    },
  ],
  settings: {
    react: {
      version: "detect",
    },
  },
};

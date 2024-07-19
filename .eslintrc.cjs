const COPYRIGHT_HEADER = `/*
Copyright %%CURRENT_YEAR%% New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

`;

module.exports = {
  plugins: ["matrix-org"],
  extends: [
    "plugin:matrix-org/react",
    "plugin:matrix-org/a11y",
    "plugin:matrix-org/typescript",
    "prettier",
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
  },
  settings: {
    react: {
      version: "detect",
    },
  },
};

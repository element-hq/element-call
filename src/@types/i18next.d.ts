/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import "i18next";
// import all namespaces (for the default language, only)
import app from "../../public/locales/en-GB/app.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "app";
    keySeparator: ".";
    resources: {
      app: typeof app;
    };
  }
}

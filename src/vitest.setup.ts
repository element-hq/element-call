/*
Copyright 2024 New Vector Ltd

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
import "global-jsdom/register";
import globalJsdom from "global-jsdom";
import i18n from "i18next";
import posthog from "posthog-js";
import { initReactI18next } from "react-i18next";
import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";

import { Config } from "./config/Config";

// Bare-minimum i18n config
i18n.use(initReactI18next).init({
  lng: "en-GB",
  fallbackLng: "en-GB",
  interpolation: {
    escapeValue: false, // React has built-in XSS protections
  },
});

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

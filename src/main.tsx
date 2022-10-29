/*
Copyright 2021-2022 New Vector Ltd

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

// We need to import this somewhere, once, so that the correct 'request'
// function gets set. It needs to be not in the same file as we use
// createClient, or the typescript transpiler gets confused about
// dependency references.
import "matrix-js-sdk/src/browser-index";

import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserHistory } from "history";
import * as Sentry from "@sentry/react";
import { Integrations } from "@sentry/tracing";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import Backend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";

import "./index.css";
import App from "./App";
import { init as initRageshake } from "./settings/rageshake";
import { getUrlParams } from "./UrlParams";
import { Config } from "./config/Config";

initRageshake();

console.info(`matrix-video-chat ${import.meta.env.VITE_APP_VERSION || "dev"}`);

const root = createRoot(document.getElementById("root")!);

let fatalError: Error | null = null;

if (!window.isSecureContext) {
  fatalError = new Error(
    "This app cannot run in an insecure context. To fix this, access the app " +
      "via a local loopback address, or serve it over HTTPS.\n" +
      "https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts"
  );
} else if (!navigator.mediaDevices) {
  fatalError = new Error("Your browser does not support WebRTC.");
}

if (fatalError !== null) {
  root.render(fatalError.message);
  throw fatalError; // Stop the app early
}

if (import.meta.env.VITE_CUSTOM_THEME) {
  const style = document.documentElement.style;
  style.setProperty("--accent", import.meta.env.VITE_THEME_ACCENT as string);
  style.setProperty(
    "--accent-20",
    import.meta.env.VITE_THEME_ACCENT_20 as string
  );
  style.setProperty("--alert", import.meta.env.VITE_THEME_ALERT as string);
  style.setProperty(
    "--alert-20",
    import.meta.env.VITE_THEME_ALERT_20 as string
  );
  style.setProperty("--links", import.meta.env.VITE_THEME_LINKS as string);
  style.setProperty(
    "--primary-content",
    import.meta.env.VITE_THEME_PRIMARY_CONTENT as string
  );
  style.setProperty(
    "--secondary-content",
    import.meta.env.VITE_THEME_SECONDARY_CONTENT as string
  );
  style.setProperty(
    "--tertiary-content",
    import.meta.env.VITE_THEME_TERTIARY_CONTENT as string
  );
  style.setProperty(
    "--tertiary-content-20",
    import.meta.env.VITE_THEME_TERTIARY_CONTENT_20 as string
  );
  style.setProperty(
    "--quaternary-content",
    import.meta.env.VITE_THEME_QUATERNARY_CONTENT as string
  );
  style.setProperty(
    "--quinary-content",
    import.meta.env.VITE_THEME_QUINARY_CONTENT as string
  );
  style.setProperty("--system", import.meta.env.VITE_THEME_SYSTEM as string);
  style.setProperty(
    "--background",
    import.meta.env.VITE_THEME_BACKGROUND as string
  );
  style.setProperty(
    "--background-85",
    import.meta.env.VITE_THEME_BACKGROUND_85 as string
  );
}

const history = createBrowserHistory();

const languageDetector = new LanguageDetector();
languageDetector.addDetector({
  name: "urlFragment",
  // Look for a language code in the URL's fragment
  lookup: () => getUrlParams().lang ?? undefined,
});

i18n
  .use(Backend)
  .use(languageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en-GB",
    defaultNS: "app",
    keySeparator: false,
    nsSeparator: false,
    pluralSeparator: "|",
    contextSeparator: "|",
    interpolation: {
      escapeValue: false, // React has built-in XSS protections
    },
    detection: {
      // No localStorage detectors or caching here, since we don't have any way
      // of letting the user manually select a language
      order: ["urlFragment", "navigator"],
      caches: [],
    },
  });

// Initilization done after the App config has loaded:
function onConfigLoaded() {
  Sentry.init({
    dsn: Config.instance.config.sentry.dns,
    environment: Config.instance.config.sentry.environment ?? "production",
    integrations: [
      new Integrations.BrowserTracing({
        routingInstrumentation: Sentry.reactRouterV5Instrumentation(history),
      }),
    ],
    tracesSampleRate: 1.0,
  });
}

root.render(
  <StrictMode>
    <App history={history} onConfigLoaded={onConfigLoaded} />
  </StrictMode>
);

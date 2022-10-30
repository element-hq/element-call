import Olm from "@matrix-org/olm";
import olmWasmPath from "@matrix-org/olm/olm.wasm?url";
import { Integrations } from "@sentry/tracing";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import Backend from "i18next-http-backend";
import { useEffect, useState } from "react";
import * as Sentry from "@sentry/react";

import { getUrlParams } from "./UrlParams";
import { Config } from "./config/Config";
import { DEFAULT_CONFIG } from "./config/ConfigOptions";

enum LoadState {
  None,
  Loading,
  Loaded,
}

// We need to synchonysly track the if init on the deps is already called:
// otherwise strict mode will trigger the effect twice with xxxState still beeing LoadState.None
// resulting in calling init twice.
let alreadyInitializedOlm = false;
let alreadyInitializedConfig = false;
let alreadyInitializedSentry = false;
let alreadyInitializedi18n = false;

export function useDependenciesLoaded(): boolean {
  // We track the loading state of all dependencies so that we can control the order/dependencies of the initialization
  const [olmState, setOlmState] = useState(LoadState.None);
  const [configState, setConfigState] = useState(LoadState.None);
  const [sentryState, setSentryState] = useState(LoadState.None);
  const [i18nState, seti18nState] = useState(LoadState.None);

  useEffect(() => {
    // olm
    if (olmState === LoadState.None && !alreadyInitializedOlm) {
      alreadyInitializedOlm = true;
      setOlmState(LoadState.Loading);
      // TODO: https://gitlab.matrix.org/matrix-org/olm/-/issues/10
      window.OLM_OPTIONS = {};
      Olm.init({ locateFile: () => olmWasmPath }).then(() =>
        setOlmState(LoadState.Loaded)
      );
    }

    // config
    if (configState === LoadState.None && !alreadyInitializedConfig) {
      alreadyInitializedConfig = true;

      setConfigState(LoadState.Loading);
      Config.init().then(() => {
        setConfigState(LoadState.Loaded);
      });
    }

    //sentry (only initialize after the config is ready)
    if (
      sentryState === LoadState.None &&
      configState === LoadState.Loaded &&
      !alreadyInitializedSentry
    ) {
      alreadyInitializedSentry = true;

      Sentry.init({
        dsn: Config.instance.config.sentry?.dns ?? DEFAULT_CONFIG.sentry.dns,
        environment:
          Config.instance.config.sentry.environment ??
          DEFAULT_CONFIG.sentry.environment,
        integrations: [
          new Integrations.BrowserTracing({
            routingInstrumentation:
              Sentry.reactRouterV5Instrumentation(history),
          }),
        ],
        tracesSampleRate: 1.0,
      });
      setSentryState(LoadState.Loaded);
    }

    //i18n
    if (i18nState === LoadState.None && !alreadyInitializedi18n) {
      alreadyInitializedi18n = true;
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
      seti18nState(LoadState.Loaded);
    }
  }, [configState, i18nState, olmState, sentryState]);

  return (
    olmState === LoadState.Loaded &&
    configState === LoadState.Loaded &&
    sentryState === LoadState.Loaded &&
    i18nState === LoadState.Loaded
  );
}

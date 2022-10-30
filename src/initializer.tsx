/*
Copyright 2021 New Vector Ltd

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

import Olm from "@matrix-org/olm";
import olmWasmPath from "@matrix-org/olm/olm.wasm?url";
import { Integrations } from "@sentry/tracing";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import Backend from "i18next-http-backend";
import * as Sentry from "@sentry/react";

import { getUrlParams } from "./UrlParams";
import { Config } from "./config/Config";
import { DEFAULT_CONFIG } from "./config/ConfigOptions";

enum LoadState {
  None,
  Loading,
  Loaded,
}

class DependencyLoadStates {
  olm: LoadState = LoadState.None;
  config: LoadState = LoadState.None;
  sentry: LoadState = LoadState.None;
  i18n: LoadState = LoadState.None;

  allDepsAreLoaded() {
    const notLoadedDeps = Object.values(this).filter(
      (s) => s !== LoadState.Loaded
    );
    return notLoadedDeps.length === 0;
  }
}

export class Initializer {
  private static _instance: Initializer;

  public static init(): Promise<void> | null {
    if (Initializer?._instance?.initPromise) {
      return null;
    }
    Initializer._instance = new Initializer();
    Initializer._instance.initPromise = new Promise<void>((resolve) => {
      // initStep calls itself recursivly until everything is initialized in the correct order.
      // Then the promise gets resolved.
      Initializer._instance.initStep(resolve);
    });
    return Initializer._instance.initPromise;
  }

  loadStates = new DependencyLoadStates();

  initStep(resolve: (value: void | PromiseLike<void>) => void) {
    // olm
    if (this.loadStates.olm === LoadState.None) {
      this.loadStates.olm = LoadState.Loading;
      // TODO: https://gitlab.matrix.org/matrix-org/olm/-/issues/10
      window.OLM_OPTIONS = {};
      Olm.init({ locateFile: () => olmWasmPath }).then(() => {
        this.loadStates.olm = LoadState.Loaded;
        this.initStep(resolve);
      });
    }

    // config
    if (this.loadStates.config === LoadState.None) {
      this.loadStates.config = LoadState.Loading;
      Config.init().then(() => {
        this.loadStates.config = LoadState.Loaded;
        this.initStep(resolve);
      });
    }

    //sentry (only initialize after the config is ready)
    if (
      this.loadStates.sentry === LoadState.None &&
      this.loadStates.config === LoadState.Loaded
    ) {
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
      this.loadStates.sentry = LoadState.Loaded;
    }

    //i18n
    if (this.loadStates.i18n === LoadState.None) {
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
      this.loadStates.i18n = LoadState.Loaded;
    }

    if (this.loadStates.allDepsAreLoaded()) {
      // resolve if there is no dependency that is not loaded
      resolve();
    }
  }
  private initPromise: Promise<void>;
}

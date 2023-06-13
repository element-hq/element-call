/*
Copyright 2022 New Vector Ltd

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

import { Integrations } from "@sentry/tracing";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import Backend from "i18next-http-backend";
import * as Sentry from "@sentry/react";

import { getUrlParams } from "./UrlParams";
import { Config } from "./config/Config";
import { ElementCallOpenTelemetry } from "./otel/otel";

enum LoadState {
  None,
  Loading,
  Loaded,
}

class DependencyLoadStates {
  // TODO: decide where olm should be initialized (see TODO comment below)
  // olm: LoadState = LoadState.None;
  config: LoadState = LoadState.None;
  sentry: LoadState = LoadState.None;
  openTelemetry: LoadState = LoadState.None;

  allDepsAreLoaded() {
    return !Object.values(this).some((s) => s !== LoadState.Loaded);
  }
}

export class Initializer {
  private static internalInstance: Initializer;
  private isInitialized = false;

  public static isInitialized(): boolean {
    return Initializer.internalInstance?.isInitialized;
  }

  public static initBeforeReact() {
    // this maybe also needs to return a promise in the future,
    // if we have to do async inits before showing the loading screen
    // but this should be avioded if possible

    //i18n
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

    // Custom Themeing
    if (import.meta.env.VITE_CUSTOM_THEME) {
      const style = document.documentElement.style;
      style.setProperty(
        "--accent",
        import.meta.env.VITE_THEME_ACCENT as string
      );
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
      style.setProperty(
        "--system",
        import.meta.env.VITE_THEME_SYSTEM as string
      );
      style.setProperty(
        "--background",
        import.meta.env.VITE_THEME_BACKGROUND as string
      );
      style.setProperty(
        "--background-85",
        import.meta.env.VITE_THEME_BACKGROUND_85 as string
      );
    }

    // Custom fonts
    const { fonts, fontScale } = getUrlParams();
    if (fontScale !== null) {
      document.documentElement.style.setProperty(
        "--font-scale",
        fontScale.toString()
      );
    }
    if (fonts.length > 0) {
      document.documentElement.style.setProperty(
        "--font-family",
        fonts.map((f) => `"${f}"`).join(", ")
      );
    }
  }

  public static init(): Promise<void> | null {
    if (Initializer?.internalInstance?.initPromise) {
      return null;
    }
    Initializer.internalInstance = new Initializer();
    Initializer.internalInstance.initPromise = new Promise<void>((resolve) => {
      // initStep calls itself recursivly until everything is initialized in the correct order.
      // Then the promise gets resolved.
      Initializer.internalInstance.initStep(resolve);
    });
    return Initializer.internalInstance.initPromise;
  }

  loadStates = new DependencyLoadStates();

  initStep(resolve: (value: void | PromiseLike<void>) => void) {
    // TODO: Olm is initialized with the client currently (see `initClient()` and `olm.ts`)
    // we need to decide if we want to init it here or keep it in initClient
    // if (this.loadStates.olm === LoadState.None) {
    //   this.loadStates.olm = LoadState.Loading;
    //   // TODO: https://gitlab.matrix.org/matrix-org/olm/-/issues/10
    //   window.OLM_OPTIONS = {};
    //   Olm.init({ locateFile: () => olmWasmPath }).then(() => {
    //     this.loadStates.olm = LoadState.Loaded;
    //     this.initStep(resolve);
    //   });
    // }

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
      if (Config.get().sentry?.DSN && Config.get().sentry?.environment) {
        Sentry.init({
          dsn: Config.get().sentry?.DSN,
          environment: Config.get().sentry?.environment,
          integrations: [
            new Integrations.BrowserTracing({
              routingInstrumentation:
                Sentry.reactRouterV5Instrumentation(history),
            }),
          ],
          tracesSampleRate: 1.0,
        });
      }
      // Sentry is now 'loadeed' (even if we actually skipped starting
      // it due to to not being configured)
      this.loadStates.sentry = LoadState.Loaded;
    }

    // OpenTelemetry (also only after config loaded)
    if (
      this.loadStates.openTelemetry === LoadState.None &&
      this.loadStates.config === LoadState.Loaded
    ) {
      ElementCallOpenTelemetry.globalInit();
      this.loadStates.openTelemetry = LoadState.Loaded;
    }

    if (this.loadStates.allDepsAreLoaded()) {
      // resolve if there is no dependency that is not loaded
      resolve();
      this.isInitialized = true;
    }
  }
  private initPromise: Promise<void> | null;
}

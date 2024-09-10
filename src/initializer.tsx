/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import Backend from "i18next-http-backend";
import * as Sentry from "@sentry/react";
import { logger } from "matrix-js-sdk/src/logger";

import { getUrlParams } from "./UrlParams";
import { Config } from "./config/Config";
import { ElementCallOpenTelemetry } from "./otel/otel";
import { platform } from "./Platform";

enum LoadState {
  None,
  Loading,
  Loaded,
}

class DependencyLoadStates {
  public config: LoadState = LoadState.None;
  public sentry: LoadState = LoadState.None;
  public openTelemetry: LoadState = LoadState.None;

  public allDepsAreLoaded(): boolean {
    return !Object.values(this).some((s) => s !== LoadState.Loaded);
  }
}

export class Initializer {
  private static internalInstance: Initializer;
  private isInitialized = false;

  public static isInitialized(): boolean {
    return Initializer.internalInstance?.isInitialized;
  }

  public static initBeforeReact(): void {
    // this maybe also needs to return a promise in the future,
    // if we have to do async inits before showing the loading screen
    // but this should be avoided if possible

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
        keySeparator: ".",
        nsSeparator: false,
        pluralSeparator: "_",
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
      })
      .catch((e) => {
        logger.error("Failed to initialize i18n", e);
      });

    // Custom Themeing
    if (import.meta.env.VITE_CUSTOM_CSS) {
      const style = document.createElement("style");
      style.textContent = import.meta.env.VITE_CUSTOM_CSS;
      document.head.appendChild(style);
    }

    // Custom fonts
    const { fonts, fontScale } = getUrlParams();
    if (fontScale !== null) {
      document.documentElement.style.setProperty(
        "--font-scale",
        fontScale.toString(),
      );
    }
    if (fonts.length > 0) {
      document.documentElement.style.setProperty(
        "--font-family",
        fonts.map((f) => `"${f}"`).join(", "),
      );
    }

    // Add the platform to the DOM, so CSS can query it
    document.body.setAttribute("data-platform", platform);
  }

  public static init(): Promise<void> | null {
    if (Initializer?.internalInstance?.initPromise) {
      return null;
    }
    Initializer.internalInstance = new Initializer();
    Initializer.internalInstance.initPromise = new Promise<void>((resolve) => {
      // initStep calls itself recursively until everything is initialized in the correct order.
      // Then the promise gets resolved.
      Initializer.internalInstance.initStep(resolve);
    });
    return Initializer.internalInstance.initPromise;
  }

  private loadStates = new DependencyLoadStates();

  private initStep(resolve: (value: void | PromiseLike<void>) => void): void {
    // config
    if (this.loadStates.config === LoadState.None) {
      this.loadStates.config = LoadState.Loading;
      Config.init().then(
        () => {
          this.loadStates.config = LoadState.Loaded;
          this.initStep(resolve);
        },
        (e) => {
          logger.error("Failed to load config", e);
        },
      );
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
            Sentry.reactRouterV5BrowserTracingIntegration({ history }),
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

  private initPromise?: Promise<void>;
}

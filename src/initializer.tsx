/*
Copyright 2022 Matrix.org Foundation C.I.C.

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
import * as Sentry from "@sentry/react";

import { Config } from "./config/Config";
import { DEFAULT_CONFIG } from "./config/ConfigOptions";

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

  allDepsAreLoaded() {
    return !Object.values(this).some((s) => s !== LoadState.Loaded);
  }
}

export class Initializer {
  private static internalInstance: Initializer;

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
      Sentry.init({
        dsn: Config.instance.config.sentry?.DSN ?? DEFAULT_CONFIG.sentry.DSN,
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

    if (this.loadStates.allDepsAreLoaded()) {
      // resolve if there is no dependency that is not loaded
      resolve();
    }
  }
  private initPromise: Promise<void>;
}

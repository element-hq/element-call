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

import { getUrlParams } from "../UrlParams";
import {
  DEFAULT_CONFIG,
  ConfigOptions,
  ResolvedConfigOptions,
} from "./ConfigOptions";

export class Config {
  private static internalInstance: Config;

  public static get(): ConfigOptions {
    if (!this.internalInstance?.config)
      throw new Error("Config instance read before config got initialized");
    return this.internalInstance.config;
  }

  public static init(): Promise<void> {
    if (Config.internalInstance?.initPromise) {
      return Config.internalInstance.initPromise;
    }
    Config.internalInstance = new Config();
    Config.internalInstance.initPromise = new Promise<void>((resolve) => {
      downloadConfig("../config.json").then((config) => {
        Config.internalInstance.config = { ...DEFAULT_CONFIG, ...config };
        resolve();
      });
    });
    return Config.internalInstance.initPromise;
  }

  /**
   * This is a alternative initializer that does not load anything
   * from a hosted config file but instead just initializes the conifg using the
   * default config.
   *
   * It is supposed to only be used in tests. (It is executed in `vite.setup.js`)
   */
  public static initDefault(): void {
    Config.internalInstance = new Config();
    Config.internalInstance.config = { ...DEFAULT_CONFIG };
  }

  // Convenience accessors
  public static defaultHomeserverUrl(): string | undefined {
    return (
      getUrlParams().homeserver ??
      Config.get().default_server_config?.["m.homeserver"].base_url
    );
  }

  public static defaultServerName(): string | undefined {
    const homeserver = getUrlParams().homeserver;
    if (homeserver) {
      const url = new URL(homeserver);
      return url.hostname;
    }
    return Config.get().default_server_config?.["m.homeserver"].server_name;
  }

  public config?: ResolvedConfigOptions;
  private initPromise?: Promise<void>;
}

async function downloadConfig(
  configJsonFilename: string,
): Promise<ConfigOptions> {
  const url = new URL(configJsonFilename, window.location.href);
  url.searchParams.set("cachebuster", Date.now().toString());
  const res = await fetch(url, {
    cache: "no-cache",
    method: "GET",
  });

  if (!res.ok || res.status === 404 || res.status === 0) {
    // Lack of a config isn't an error, we should just use the defaults.
    // Also treat a blank config as no config, assuming the status code is 0, because we don't get 404s from file:
    // URIs so this is the only way we can not fail if the file doesn't exist when loading from a file:// URI.
    return DEFAULT_CONFIG;
  }

  return res.json();
}

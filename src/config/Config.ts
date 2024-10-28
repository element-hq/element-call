/*
Copyright 2021-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { merge } from "lodash";

import { getUrlParams } from "../UrlParams";
import {
  DEFAULT_CONFIG,
  ConfigOptions,
  ResolvedConfigOptions,
} from "./ConfigOptions";

export class Config {
  private static internalInstance: Config | undefined;

  public static get(): ResolvedConfigOptions {
    if (!this.internalInstance?.config)
      throw new Error("Config instance read before config got initialized");
    return this.internalInstance.config;
  }

  public static async init(): Promise<void> {
    if (!Config.internalInstance?.initPromise) {
      const internalInstance = new Config();
      Config.internalInstance = internalInstance;

      Config.internalInstance.initPromise = downloadConfig(
        "../config.json",
      ).then((config) => {
        internalInstance.config = merge({}, DEFAULT_CONFIG, config);
      });
    }
    return Config.internalInstance.initPromise;
  }

  /**
   * This is a alternative initializer that does not load anything
   * from a hosted config file but instead just initializes the config using the
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

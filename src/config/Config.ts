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

import { DEFAULT, IConfigOptions } from "./ConfigOptions";

class Config {
    static instance: Config
    config: IConfigOptions;
    initPromise: Promise<void>;
    constructor(){
        this.config = DEFAULT
    }
}

export function init(): Promise<void> {
    if(Config?.instance?.initPromise){
        return Config.instance.initPromise;
    }
    Config.instance = new Config();
    Config.instance.initPromise = new Promise<void>((resolve)=>{
        downloadConfig("../config.json").then((config)=>{
            Config.instance.config = config;
            resolve();
        })
    });   
    return Config.instance.initPromise;
}

async function downloadConfig(configJsonFilename: string): Promise<IConfigOptions> {
  const url = new URL(configJsonFilename, window.location.href);
  url.searchParams.set("cachebuster", Date.now().toString());
  const res = await fetch(url, {
      cache: "no-cache",
      method: "GET",
  });

  if (res.status === 404 || res.status === 0) {
      // Lack of a config isn't an error, we should just use the defaults.
      // Also treat a blank config as no config, assuming the status code is 0, because we don't get 404s from file:
      // URIs so this is the only way we can not fail if the file doesn't exist when loading from a file:// URI.
      return {} as IConfigOptions;
  }

  if (res.ok) {
      return res.json();
  }
}
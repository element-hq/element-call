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

import { logger } from "matrix-js-sdk/src/logger";
import { BehaviorSubject, Observable } from "rxjs";
import { useObservableEagerState } from "observable-hooks";

import { PosthogAnalytics } from "../analytics/PosthogAnalytics";

export class Setting<T> {
  public constructor(key: string, defaultValue: T) {
    this.key = `matrix-setting-${key}`;

    const storedValue = localStorage.getItem(this.key);
    let initialValue = defaultValue;
    if (storedValue !== null) {
      try {
        initialValue = JSON.parse(storedValue);
      } catch (e) {
        logger.warn(`Invalid value stored for setting ${key}: ${storedValue}`);
      }
    }

    this._value = new BehaviorSubject(initialValue);
    this.value = this._value;
  }

  private readonly key: string;

  private readonly _value: BehaviorSubject<T>;
  public readonly value: Observable<T>;

  public readonly setValue = (value: T): void => {
    this._value.next(value);
    localStorage.setItem(this.key, JSON.stringify(value));
  };
}

/**
 * React hook that returns a settings's current value and a setter.
 */
export function useSetting<T>(setting: Setting<T>): [T, (value: T) => void] {
  return [useObservableEagerState(setting.value), setting.setValue];
}

// null = undecided
export const optInAnalytics = new Setting<boolean | null>(
  "opt-in-analytics",
  null,
);
// TODO: This setting can be disabled. Work out an approach to disableable
// settings thats works for Observables in addition to React.
export const useOptInAnalytics = (): [
  boolean | null,
  ((value: boolean | null) => void) | null,
] => {
  const setting = useSetting(optInAnalytics);
  return PosthogAnalytics.instance.isEnabled() ? setting : [false, null];
};

export const developerSettingsTab = new Setting(
  "developer-settings-tab",
  false,
);

export const duplicateTiles = new Setting("duplicate-tiles", 0);

export const audioInput = new Setting<string | undefined>(
  "audio-input",
  undefined,
);
export const audioOutput = new Setting<string | undefined>(
  "audio-output",
  undefined,
);
export const videoInput = new Setting<string | undefined>(
  "video-input",
  undefined,
);

export const alwaysShowSelf = new Setting<boolean>("always-show-self", true);

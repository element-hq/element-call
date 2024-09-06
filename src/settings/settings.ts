/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
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
        logger.warn(
          `Invalid value stored for setting ${key}: ${storedValue}.`,
          e,
        );
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

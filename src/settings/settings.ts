/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/lib/logger";
import { BehaviorSubject } from "rxjs";

import { PosthogAnalytics } from "../analytics/PosthogAnalytics";
import { type Behavior } from "../state/Behavior";
import { useBehavior } from "../useBehavior";

export class Setting<T> {
  public constructor(
    key: string,
    public readonly defaultValue: T,
  ) {
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

    this._value$ = new BehaviorSubject(initialValue);
    this.value$ = this._value$;
  }

  private readonly key: string;

  private readonly _value$: BehaviorSubject<T>;
  public readonly value$: Behavior<T>;

  public readonly setValue = (value: T): void => {
    this._value$.next(value);
    localStorage.setItem(this.key, JSON.stringify(value));
  };
  public readonly getValue = (): T => {
    return this._value$.getValue();
  };
}

/**
 * React hook that returns a settings's current value and a setter.
 */
export function useSetting<T>(setting: Setting<T>): [T, (value: T) => void] {
  return [useBehavior(setting.value$), setting.setValue];
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

export const developerMode = new Setting("developer-settings-tab", false);

export const duplicateTiles = new Setting("duplicate-tiles", 0);

export const debugTileLayout = new Setting("debug-tile-layout", false);

export const showConnectionStats = new Setting<boolean>(
  "show-connection-stats",
  false,
);

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

export const backgroundBlur = new Setting<boolean>("background-blur", false);

export const showHandRaisedTimer = new Setting<boolean>(
  "hand-raised-show-timer",
  false,
);

export const showReactions = new Setting<boolean>("reactions-show", true);

export const playReactionsSound = new Setting<boolean>(
  "reactions-play-sound",
  true,
);

export const soundEffectVolume = new Setting<number>(
  "sound-effect-volume",
  0.5,
);

export const muteAllAudio = new Setting<boolean>("mute-all-audio", false);

export const alwaysShowSelf = new Setting<boolean>("always-show-self", true);

export const alwaysShowIphoneEarpiece = new Setting<boolean>(
  "always-show-iphone-earpiece",
  false,
);

export enum MatrixRTCMode {
  Legacy = "legacy",
  Compatibil = "compatibil",
  Matrix_2_0 = "matrix_2_0",
}

export const matrixRTCMode = new Setting<MatrixRTCMode>(
  "matrix-rtc-mode",
  MatrixRTCMode.Legacy,
);

export const customLivekitUrl = new Setting<string | null>(
  "custom-livekit-url",
  null,
);

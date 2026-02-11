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
    this.hasStoredValue = storedValue !== null;
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
  private readonly hasStoredValue: boolean;

  private readonly _value$: BehaviorSubject<T>;
  public readonly value$: Behavior<T>;

  public readonly setValue = (value: T): void => {
    this._value$.next(value);
    localStorage.setItem(this.key, JSON.stringify(value));
  };
  public readonly getValue = (): T => {
    return this._value$.getValue();
  };

  /**
   * Update the setting's value from a config source, but only if the user
   * hasn't explicitly set a value in localStorage. This lets admins set
   * org-wide defaults in config.json that users can override.
   */
  public seedFromConfig(value: T): void {
    if (!this.hasStoredValue) {
      this._value$.next(value);
    }
  }
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
  Compatibility = "compatibility",
  /** This implies using
   *  - sticky events
   *  - hashed RTC backend identity
   *  - the new endpoint for the jwt token on the local membership (remote memberships will always try the new jwt endpoint first -> then the legacy one)
   *  - use the hashed identity for the local membership
   */
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

export type VideoCodec = "vp8" | "vp9" | "h264" | "av1";

export const advancedScreenShare = new Setting<boolean>(
  "advanced-screen-share",
  false,
);

export const screenShareResolution = new Setting<string>(
  "screen-share-resolution",
  "1920x1080",
);

export const screenShareFramerate = new Setting<number>(
  "screen-share-framerate",
  30,
);

export const screenShareBitrate = new Setting<number>(
  "screen-share-bitrate",
  5_000_000,
);

export const screenShareCodec = new Setting<VideoCodec>(
  "screen-share-codec",
  "vp9",
);

// Camera video quality settings
export const advancedCamera = new Setting<boolean>("advanced-camera", false);

export const cameraResolution = new Setting<string>(
  "camera-resolution",
  "1280x720",
);

export const cameraFramerate = new Setting<number>("camera-framerate", 30);

export const cameraBitrate = new Setting<number>(
  "camera-bitrate",
  1_700_000,
);

export const cameraCodec = new Setting<VideoCodec>("camera-codec", "vp8");

// Audio processing settings
export const echoCancellationSetting = new Setting<boolean>(
  "echo-cancellation",
  true,
);

export const noiseSuppressionSetting = new Setting<boolean>(
  "noise-suppression",
  true,
);

export const autoGainControlSetting = new Setting<boolean>(
  "auto-gain-control",
  true,
);

/**
 * Seed setting defaults from config.json's media_quality section.
 * Call this after Config.init() has resolved.
 * Only updates settings that the user hasn't explicitly set in localStorage.
 */
export function seedSettingsFromConfig(
  mediaQuality: {
    video_codec?: VideoCodec;
    video?: {
      max_resolution?: number;
      max_bitrate?: number;
      max_framerate?: number;
    };
    screen_share?: {
      max_resolution?: number;
      max_bitrate?: number;
      max_framerate?: number;
    };
  } | undefined,
): void {
  if (!mediaQuality) return;

  const codec = mediaQuality.video_codec;
  if (codec) {
    screenShareCodec.seedFromConfig(codec);
    cameraCodec.seedFromConfig(codec);
  }

  const screen = mediaQuality.screen_share;
  if (screen) {
    if (screen.max_resolution) {
      const width = Math.round((screen.max_resolution * 16) / 9);
      screenShareResolution.seedFromConfig(`${width}x${screen.max_resolution}`);
    }
    if (screen.max_framerate) {
      screenShareFramerate.seedFromConfig(screen.max_framerate);
    }
    if (screen.max_bitrate) {
      screenShareBitrate.seedFromConfig(screen.max_bitrate);
    }
  }

  const video = mediaQuality.video;
  if (video) {
    if (video.max_resolution) {
      const width = Math.round((video.max_resolution * 16) / 9);
      cameraResolution.seedFromConfig(`${width}x${video.max_resolution}`);
    }
    if (video.max_framerate) {
      cameraFramerate.seedFromConfig(video.max_framerate);
    }
    if (video.max_bitrate) {
      cameraBitrate.seedFromConfig(video.max_bitrate);
    }
  }
}

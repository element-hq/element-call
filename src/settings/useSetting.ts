/*
Copyright 2022 - 2023 New Vector Ltd

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

import { useCallback, useMemo } from "react";

import { PosthogAnalytics } from "../analytics/PosthogAnalytics";
import {
  getLocalStorageItem,
  setLocalStorageItem,
  useLocalStorage,
} from "../useLocalStorage";

type Setting<T> = [T, (value: T) => void];
type DisableableSetting<T> = [T, ((value: T) => void) | null];

export const getSettingKey = (name: string): string => {
  return `matrix-setting-${name}`;
};
// Like useState, but reads from and persists the value to localStorage
export const useSetting = <T>(name: string, defaultValue: T): Setting<T> => {
  const key = useMemo(() => getSettingKey(name), [name]);

  const [item, setItem] = useLocalStorage(key);

  const value = useMemo(
    () => (item == null ? defaultValue : JSON.parse(item)),
    [item, defaultValue],
  );
  const setValue = useCallback(
    (value: T) => {
      setItem(JSON.stringify(value));
    },
    [setItem],
  );

  return [value, setValue];
};

export const getSetting = <T>(name: string, defaultValue: T): T => {
  const item = getLocalStorageItem(getSettingKey(name));
  return item === null ? defaultValue : JSON.parse(item);
};

export const setSetting = <T>(name: string, newValue: T): void =>
  setLocalStorageItem(getSettingKey(name), JSON.stringify(newValue));

export const isFirefox = (): boolean => {
  const { userAgent } = navigator;
  return userAgent.includes("Firefox");
};

const canEnableSpatialAudio = (): boolean => {
  // Spatial audio means routing audio through audio contexts. On Chrome,
  // this bypasses the AEC processor and so breaks echo cancellation.
  // We only allow spatial audio to be enabled on Firefox which we know
  // passes audio context audio through the AEC algorithm.
  // https://bugs.chromium.org/p/chromium/issues/detail?id=687574 is the
  // chrome bug for this: once this is fixed and the updated version is deployed
  // widely enough, we can allow spatial audio everywhere. It's currently in a
  // chrome flag, so we could enable this in Electron if we enabled the chrome flag
  // in the Electron wrapper.
  return isFirefox();
};

export const useSpatialAudio = (): DisableableSetting<boolean> => {
  const settingVal = useSetting("spatial-audio", false);
  if (canEnableSpatialAudio()) return settingVal;

  return [false, null];
};

// null = undecided
export const useOptInAnalytics = (): DisableableSetting<boolean | null> => {
  const settingVal = useSetting<boolean | null>("opt-in-analytics", null);
  if (PosthogAnalytics.instance.isEnabled()) return settingVal;

  return [false, null];
};

export const useDeveloperSettingsTab = (): Setting<boolean> =>
  useSetting("developer-settings-tab", false);

export const useShowConnectionStats = (): Setting<boolean> =>
  useSetting("show-connection-stats", false);

export const useAudioInput = (): Setting<string | undefined> =>
  useSetting<string | undefined>("audio-input", undefined);
export const useAudioOutput = (): Setting<string | undefined> =>
  useSetting<string | undefined>("audio-output", undefined);
export const useVideoInput = (): Setting<string | undefined> =>
  useSetting<string | undefined>("video-input", undefined);
export const useShowInlineWebConsole = (): Setting<boolean> =>
  useSetting<boolean>("show-web-console", true);

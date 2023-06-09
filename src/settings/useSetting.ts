/*
Copyright 2022 New Vector Ltd

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

import { EventEmitter } from "events";
import { useMemo, useState, useEffect, useCallback } from "react";

import { PosthogAnalytics } from "../analytics/PosthogAnalytics";

type Setting<T> = [T, (value: T) => void];
type DisableableSetting<T> = [T, ((value: T) => void) | null];

// Bus to notify other useSetting consumers when a setting is changed
export const settingsBus = new EventEmitter();

const getSettingKey = (name: string): string => {
  return `matrix-setting-${name}`;
};
// Like useState, but reads from and persists the value to localStorage
const useSetting = <T>(name: string, defaultValue: T): Setting<T> => {
  const key = useMemo(() => getSettingKey(name), [name]);

  const [value, setValue] = useState<T>(() => {
    const item = localStorage.getItem(key);
    return item == null ? defaultValue : JSON.parse(item);
  });

  useEffect(() => {
    settingsBus.on(name, setValue);
    return () => {
      settingsBus.off(name, setValue);
    };
  }, [name, setValue]);

  return [
    value,
    useCallback(
      (newValue: T) => {
        setValue(newValue);
        localStorage.setItem(key, JSON.stringify(newValue));
        settingsBus.emit(name, newValue);
      },
      [name, key, setValue]
    ),
  ];
};

export const getSetting = <T>(name: string, defaultValue: T): T => {
  const item = localStorage.getItem(getSettingKey(name));
  return item === null ? defaultValue : JSON.parse(item);
};

export const setSetting = <T>(name: string, newValue: T) => {
  localStorage.setItem(getSettingKey(name), JSON.stringify(newValue));
  settingsBus.emit(name, newValue);
};

const canEnableSpatialAudio = () => {
  const { userAgent } = navigator;
  // Spatial audio means routing audio through audio contexts. On Chrome,
  // this bypasses the AEC processor and so breaks echo cancellation.
  // We only allow spatial audio to be enabled on Firefox which we know
  // passes audio context audio through the AEC algorithm.
  // https://bugs.chromium.org/p/chromium/issues/detail?id=687574 is the
  // chrome bug for this: once this is fixed and the updated version is deployed
  // widely enough, we can allow spatial audio everywhere. It's currently in a
  // chrome flag, so we could enable this in Electron if we enabled the chrome flag
  // in the Electron wrapper.
  return userAgent.includes("Firefox");
};

export const useSpatialAudio = (): DisableableSetting<boolean> => {
  const settingVal = useSetting("spatial-audio", false);
  if (canEnableSpatialAudio()) return settingVal;

  return [false, null];
};

export const useShowInspector = () => useSetting("show-inspector", false);

// null = undecided
export const useOptInAnalytics = (): DisableableSetting<boolean | null> => {
  const settingVal = useSetting<boolean | null>("opt-in-analytics", null);
  if (PosthogAnalytics.instance.isEnabled()) return settingVal;

  return [false, null];
};

export const useNewGrid = () => useSetting("new-grid", false);

export const useDeveloperSettingsTab = () =>
  useSetting("developer-settings-tab", false);

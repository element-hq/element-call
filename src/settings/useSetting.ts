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

// Bus to notify other useSetting consumers when a setting is changed
export const settingsBus = new EventEmitter();

const getSettingKey = (name: string): string => {
  return `matrix-setting-${name}`;
};
// Like useState, but reads from and persists the value to localStorage
const useSetting = <T>(
  name: string,
  defaultValue: T
): [T, (value: T) => void] => {
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

export const useSpatialAudio = () => useSetting("spatial-audio", false);
export const useShowInspector = () => useSetting("show-inspector", false);
export const useOptInAnalytics = () => useSetting("opt-in-analytics", false);
export const useKeyboardShortcuts = () =>
  useSetting("keyboard-shortcuts", true);

/*
Copyright 2023 New Vector Ltd

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

import EventEmitter from "events";
import { useCallback, useEffect, useState } from "react";

type LocalStorageItem = ReturnType<typeof localStorage.getItem>;

// Bus to notify other useLocalStorage consumers when an item is changed
export const localStorageBus = new EventEmitter();

// Like useState, but reads from and persists the value to localStorage
export const useLocalStorage = (
  key: string,
): [LocalStorageItem, (value: string) => void] => {
  const [value, setValue] = useState<LocalStorageItem>(() =>
    localStorage.getItem(key),
  );

  useEffect(() => {
    localStorageBus.on(key, setValue);
    return (): void => {
      localStorageBus.off(key, setValue);
    };
  }, [key, setValue]);

  return [
    value,
    useCallback(
      (newValue: string) => {
        setValue(newValue);
        localStorage.setItem(key, newValue);
        localStorageBus.emit(key, newValue);
      },
      [key, setValue],
    ),
  ];
};

export const setLocalStorageItem = (key: string, value: string): void => {
  localStorage.setItem(key, value);
  localStorageBus.emit(key, value);
};

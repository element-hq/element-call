/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
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

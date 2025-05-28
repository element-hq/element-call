/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import EventEmitter from "events";
import { useCallback, useSyncExternalStore } from "react";

type LocalStorageItem = ReturnType<typeof localStorage.getItem>;

// Bus to notify other useLocalStorage consumers when an item is changed
export const localStorageBus = new EventEmitter();

/**
 * Like useState, but reads from and persists the value to localStorage
 * This hook will not update when we write to localStorage.setItem(key, value) directly.
 * For the hook to react either use the returned setter or `setLocalStorageItemReactive`.
 */
export function useLocalStorage(
  key: string,
): [LocalStorageItem, (value: string) => void] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      localStorageBus.on(key, onChange);
      return (): void => {
        localStorageBus.off(key, onChange);
      };
    },
    [key],
  );
  const getValue = useCallback(() => localStorage.getItem(key), [key]);

  const value = useSyncExternalStore(subscribe, getValue);
  const setValue = useCallback(
    (newValue: string) => setLocalStorageItemReactive(key, newValue),
    [key],
  );

  return [value, setValue];
}

export const setLocalStorageItemReactive = (
  key: string,
  value: string,
): void => {
  localStorage.setItem(key, value);
  localStorageBus.emit(key, value);
};

/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
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
  // Avoid unnecessary updates. Not avoiding them so can cause unexpected state updates across hooks.
  // For instance:
  // - In call view uses useRoomEncryptionSystem
  // - This will set the key again.
  // - All other instances of useRoomEncryptionSystem will now do a useMemo update of the e2eeSystem
  //   - because the dependency `storedPassword = useInternalRoomSharedKey(roomId);` would change.
  if (localStorage.getItem(key) === value) return;

  localStorage.setItem(key, value);
  localStorageBus.emit(key, value);
};

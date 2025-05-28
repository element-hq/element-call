/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import EventEmitter from "events";
import { useCallback, useEffect } from "react";

import { useLatest } from "./useLatest";
import { useReactiveState } from "./useReactiveState";

type LocalStorageItem = ReturnType<typeof localStorage.getItem>;

// Bus to notify other useLocalStorage consumers when an item is changed
export const localStorageBus = new EventEmitter();

// Like useState, but reads from and persists the value to localStorage
export const useLocalStorage = (
  key: string,
): [LocalStorageItem, (value: string) => void] => {
  const [value, setValue] = useReactiveState<LocalStorageItem>(
    () => localStorage.getItem(key),
    [key],
  );
  const latestValue = useLatest(value);

  useEffect(() => {
    // We're about to set up the bus listener that will enable us to react to
    // any future updates to the localStorage item. However, it's possible that
    // we already missed an update if there was an effect which modified the
    // item in the time *between* the render phase of useLocalStorage and the
    // execution of this effect. Let's update the state if that happened.
    const stored = localStorage.getItem(key);
    if (latestValue.current !== stored) setValue(stored);

    localStorageBus.on(key, setValue);
    return (): void => {
      localStorageBus.off(key, setValue);
    };
  }, [key, latestValue, setValue]);

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

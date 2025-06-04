/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useCallback } from "react";
import { TypedEventEmitter } from "matrix-js-sdk";

import { useTypedEventEmitterState } from "./useEvents";

type LocalStorageItem = ReturnType<typeof localStorage.getItem>;

// Bus to notify other useLocalStorage consumers when an item is changed
export const localStorageBus = new TypedEventEmitter<
  string,
  { [key: string]: () => void }
>();

/**
 * Like useState, but reads from and persists the value to localStorage
 * This hook will not update when we write to localStorage.setItem(key, value) directly.
 * For the hook to react either use the returned setter or `setLocalStorageItemReactive`.
 */
export function useLocalStorage(
  key: string,
): [LocalStorageItem, (value: string) => void] {
  const value = useTypedEventEmitterState(
    localStorageBus,
    key,
    useCallback(() => localStorage.getItem(key), [key]),
  );
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
  localStorageBus.emit(key);
};

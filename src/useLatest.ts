/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type RefObject, useRef } from "react";

export interface LatestRef<T> extends RefObject<T> {
  current: T; // Always defined, unlike RefObject["current"]
}

/**
 * React hook that returns a ref containing the value given on the latest
 * render. Useful for accessing the latest value of something in an effect or
 * callback when you don't want reactivity.
 */
export function useLatest<T>(value: T): LatestRef<T> {
  const ref = useRef<T>(value);
  ref.current = value;
  return ref;
}

/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { RefObject, useRef } from "react";

export interface LatestRef<T> extends RefObject<T> {
  current: T;
}

/**
 * React hook that returns a ref containing the value given on the latest
 * render.
 */
export function useLatest<T>(value: T): LatestRef<T> {
  const ref = useRef<T>(value);
  ref.current = value;
  return ref;
}

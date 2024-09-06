/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { useRef } from "react";

/**
 * React hook that returns the value given on the initial render.
 */
export function useInitial<T>(getValue: () => T): T {
  const ref = useRef<{ value: T }>();
  ref.current ??= { value: getValue() };
  return ref.current.value;
}

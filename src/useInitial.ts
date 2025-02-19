/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useRef } from "react";

/**
 * React hook that returns the value given on the initial render.
 */
export function useInitial<T>(getValue: () => T): T {
  const ref = useRef<{ value: T }>(undefined);
  // only evaluate `getValue` if the ref is undefined
  ref.current ??= { value: getValue() };
  return ref.current.value;
}

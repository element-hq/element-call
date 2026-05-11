/*
Copyright 2026 Element Software Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BehaviorSubject } from "rxjs";

import { useBehavior } from "../useBehavior";
import { type Behavior } from "./Behavior";

export type ViewModel<Snapshot> = {
  [K in keyof Snapshot as `${string & K}$`]: Behavior<Snapshot[K]>;
};

export function useViewModel<Snapshot>(vm: ViewModel<Snapshot>): Snapshot {
  const snapshot = {} as Snapshot;
  for (const key in vm) {
    const value$ = (vm as Record<string, Behavior<unknown>>)[key];
    const snapshotKey = key.slice(0, -1) as keyof Snapshot;
    // we allow using hooks in a loop here because we know the shape of the vm is static and won't change between renders, so the order of hooks calls will always be the same.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    snapshot[snapshotKey] = useBehavior(value$) as Snapshot[keyof Snapshot];
  }
  return snapshot;
}

export function createMockedViewModel<Snapshot>(
  snapshot: Snapshot,
): ViewModel<Snapshot> {
  const vm = {} as ViewModel<Snapshot>;
  for (const key in snapshot) {
    (vm as Record<string, Behavior<unknown>>)[`${key}$`] = new BehaviorSubject(
      snapshot[key],
    );
  }
  return vm;
}

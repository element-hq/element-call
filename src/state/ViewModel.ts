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

/**
 * This allows to build a view model (or Partial view model)
 * with BehaviorSubjects.
 * It can be used in tests and for simplifying view model creation for non reactive snapshot parameters.
 *
 * @param snapshot The snapshot values this view model with start with. ({a: number, b: string})
 * @returns A view model: ({a$: BehaviroSubject<number>, b$: BehaviroSubject<string>}) (note the automatic addition of $ at the end of the keys)
 */
export function createStaticViewModel<Snapshot>(
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

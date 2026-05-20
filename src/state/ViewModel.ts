/*
Copyright 2026 Element Software Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BehaviorSubject } from "rxjs";
import { useState, useEffect } from "react";

import { type Behavior } from "./Behavior";

export type ViewModel<Snapshot> = {
  [K in keyof Snapshot as `${string & K}$`]: Behavior<Snapshot[K]>;
};

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

export function useStaticViewModel<Snapshot>(
  snapshot: Snapshot,
): ViewModel<Snapshot> {
  const [vm] = useState(() => createStaticViewModel(snapshot));
  useEffect(() => {
    for (const key in snapshot) {
      (vm as unknown as Record<string, BehaviorSubject<unknown>>)[
        `${key}$`
      ].next(snapshot[key]);
    }
  }, [snapshot, vm]);
  return vm;
}

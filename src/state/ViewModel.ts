/*
Copyright 2026 Element Software Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BehaviorSubject } from "rxjs";

import { useBehavior } from "../useBehavior";
import { type Behavior } from "./Behavior";

export type ViewModel<Snapshot> = {
  [K in keyof Snapshot]: Behavior<Snapshot[K]>;
};

export function useViewModel<Snapshot>(vm: ViewModel<Snapshot>): Snapshot {
  const snapshot = {} as Snapshot;
  for (const key in vm) {
    const value$ = vm[key];
    // eslint-disable-next-line react-hooks/rules-of-hooks
    snapshot[key] = useBehavior(value$);
  }
  return snapshot;
}

export function createMockedViewModel<Snapshot>(
  snapshot: Snapshot,
): ViewModel<Snapshot> {
  const vm = {} as ViewModel<Snapshot>;
  for (const key in snapshot) {
    vm[key] = new BehaviorSubject(snapshot[key]);
  }
  return vm;
}

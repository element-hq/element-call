/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import {
  Epoch,
  mapEpoch,
  ObservableScope,
  trackEpoch,
} from "./ObservableScope";
import { withTestScheduler } from "../utils/test";
import { BehaviorSubject, timer } from "rxjs";

describe("Epoch", () => {
  it("should map the value correctly", () => {
    const epoch = new Epoch(1);
    const mappedEpoch = epoch.mapInner((v) => v + 1);
    expect(mappedEpoch.value).toBe(2);
    expect(mappedEpoch.epoch).toBe(0);
  });

  it("should be tracked from an observable", () => {
    withTestScheduler(({ expectObservable, behavior }) => {
      const observable$ = behavior("abc", {
        a: 1,
        b: 2,
        c: 3,
      });
      const epochObservable$ = observable$.pipe(trackEpoch());
      expectObservable(epochObservable$).toBe("abc", {
        a: expect.toSatisfy((e) => e.epoch === 0 && e.value === 1),
        b: expect.toSatisfy((e) => e.epoch === 1 && e.value === 2),
        c: expect.toSatisfy((e) => e.epoch === 2 && e.value === 3),
      });
    });
  });

  it("can be mapped without loosing epoch information", () => {
    withTestScheduler(({ expectObservable, behavior }) => {
      const observable$ = behavior("abc", {
        a: "A",
        b: "B",
        c: "C",
      });
      const epochObservable$ = observable$.pipe(trackEpoch());
      const derivedEpoch$ = epochObservable$.pipe(
        mapEpoch((e) => e + "-mapped"),
      );

      expectObservable(derivedEpoch$).toBe("abc", {
        a: new Epoch("A-mapped", 0),
        b: new Epoch("B-mapped", 1),
        c: new Epoch("C-mapped", 2),
      });
    });
  });
  it("obs", () => {
    const nothing = Symbol("nothing");
    const scope = new ObservableScope();
    const sb$ = new BehaviorSubject("initial");
    const su$ = new BehaviorSubject(undefined);
    expect(sb$.value).toBe("initial");
    expect(su$.value).toBe(undefined);
    expect(su$.value === nothing).toBe(false);

    const a$ = timer(10);

    scope.behavior(a$, undefined);
  });
});

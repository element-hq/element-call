/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";
import { BehaviorSubject, combineLatest, of, Subject } from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";

import {
  Epoch,
  mapEpoch,
  ObservableScope,
  trackEpoch,
} from "./ObservableScope";
import { withTestScheduler } from "../utils/test";

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

  it("diamonds emits in a predictable order", () => {
    const sb$ = new BehaviorSubject("initial");
    const root$ = sb$.pipe(trackEpoch());
    const derivedA$ = root$.pipe(mapEpoch((e) => e + "-A"));
    const derivedB$ = root$.pipe(mapEpoch((e) => e + "-B"));
    combineLatest([root$, derivedB$, derivedA$]).subscribe(
      ([root, derivedA, derivedB]) => {
        logger.log(
          "combined" +
            root.epoch +
            root.value +
            "\n" +
            derivedA.epoch +
            derivedA.value +
            "\n" +
            derivedB.epoch +
            derivedB.value,
        );
      },
    );
    sb$.next("updated");
    sb$.next("ANOTERUPDATE");
  });

  it("behavior test", () => {
    const scope = new ObservableScope();
    const s$ = new Subject();
    const behavior$ = scope.behavior(s$, 0);
    behavior$.subscribe((value) => {
      logger.log(`Received value: ${value}`);
    });
    s$.next(1);
    s$.next(2);
    s$.next(3);
    s$.next(3);
    s$.next(3);
    s$.next(3);
    s$.next(3);
    s$.complete();
  });
});

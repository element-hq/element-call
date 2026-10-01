/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";
import { Observable, Subject } from "rxjs";

import { LazyBehavior } from "./LazyBehavior";

describe("LazyBehavior", () => {
  it("runs its source only while subscribed", () => {
    const teardown = vi.fn();
    let starts = 0;
    const values$ = new Subject<number>();
    const source$ = new Observable<number>((subscriber) => {
      starts++;
      const subscription = values$.subscribe(subscriber);
      return (): void => {
        teardown();
        subscription.unsubscribe();
      };
    });
    const lazy$ = new LazyBehavior(source$, 0);
    expect(starts).toBe(0);
    expect(lazy$.value).toBe(0);

    const seenByFirst: number[] = [];
    const first = lazy$.subscribe((v) => seenByFirst.push(v));
    expect(starts).toBe(1);
    values$.next(1);
    expect(seenByFirst).toEqual([0, 1]);
    expect(lazy$.value).toBe(1);

    const seenBySecond: number[] = [];
    const second = lazy$.subscribe((v) => seenBySecond.push(v));
    expect(starts).toBe(1);
    expect(seenBySecond).toEqual([1]);

    first.unsubscribe();
    expect(teardown).not.toHaveBeenCalled();
    second.unsubscribe();
    expect(teardown).toHaveBeenCalledTimes(1);

    values$.next(2);
    expect(lazy$.value).toBe(1);
    lazy$.subscribe().unsubscribe();
    expect(starts).toBe(2);
  });
});

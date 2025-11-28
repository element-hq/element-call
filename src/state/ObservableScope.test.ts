/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BehaviorSubject, combineLatest, Subject } from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";
import { sleep } from "matrix-js-sdk/lib/utils";

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

describe("Reconcile", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should wait clean up before processing next", async () => {
    vi.useFakeTimers();
    const scope = new ObservableScope();
    const behavior$ = new BehaviorSubject<number>(0);

    const setup = vi.fn().mockImplementation(async () => await sleep(100));
    const cleanup = vi
      .fn()
      .mockImplementation(async (n: number) => await sleep(100));
    scope.reconcile(behavior$, async (value) => {
      await setup();
      return async (): Promise<void> => {
        await cleanup(value);
      };
    });
    // Let the initial setup process
    await vi.advanceTimersByTimeAsync(120);
    expect(setup).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(0);

    // Send next value
    behavior$.next(1);
    await vi.advanceTimersByTimeAsync(50);
    // Should not have started setup for 1 yet
    expect(setup).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledWith(0);

    // Let cleanup finish
    await vi.advanceTimersByTimeAsync(50);
    // Now setup for 1 should have started
    expect(setup).toHaveBeenCalledTimes(2);
  });

  it("should skip intermediates values that are not setup", async () => {
    vi.useFakeTimers();
    const scope = new ObservableScope();
    const behavior$ = new BehaviorSubject<number>(0);

    const setup = vi
      .fn()
      .mockImplementation(async (n: number) => await sleep(100));

    const cleanupLock = Promise.withResolvers();
    const cleanup = vi
      .fn()
      .mockImplementation(async (n: number) => await cleanupLock.promise);

    scope.reconcile(behavior$, async (value) => {
      await setup(value);
      return async (): Promise<void> => {
        await cleanup(value);
      };
    });
    // Let the initial setup process (0)
    await vi.advanceTimersByTimeAsync(120);

    // Send 4 next values quickly
    behavior$.next(1);
    behavior$.next(2);
    behavior$.next(3);
    behavior$.next(4);

    await vi.advanceTimersByTimeAsync(3000);
    // should have only called cleanup for 0
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledWith(0);
    // Let cleanup finish
    cleanupLock.resolve(undefined);
    await vi.advanceTimersByTimeAsync(120);

    // Now setup for 4 should have started, skipping 1,2,3
    expect(setup).toHaveBeenCalledTimes(2);
    expect(setup).toHaveBeenCalledWith(4);
    expect(setup).not.toHaveBeenCalledWith(1);
    expect(setup).not.toHaveBeenCalledWith(2);
    expect(setup).not.toHaveBeenCalledWith(3);
  });

  it("should wait for setup to complete before starting cleanup", async () => {
    vi.useFakeTimers();
    const scope = new ObservableScope();
    const behavior$ = new BehaviorSubject<number>(0);

    const setup = vi
      .fn()
      .mockImplementation(async (n: number) => await sleep(3000));

    const cleanupLock = Promise.withResolvers();
    const cleanup = vi
      .fn()
      .mockImplementation(async (n: number) => await cleanupLock.promise);

    scope.reconcile(behavior$, async (value) => {
      await setup(value);
      return async (): Promise<void> => {
        await cleanup(value);
      };
    });

    await vi.advanceTimersByTimeAsync(500);
    // Setup for 0 should be in progress
    expect(setup).toHaveBeenCalledTimes(1);

    behavior$.next(1);
    await vi.advanceTimersByTimeAsync(500);

    // Should not have started setup for 1 yet
    expect(setup).not.toHaveBeenCalledWith(1);
    // Should not have called cleanup yet, because the setup for 0 is not done
    expect(cleanup).toHaveBeenCalledTimes(0);

    // Let setup for 0 finish
    await vi.advanceTimersByTimeAsync(2500 + 100);
    // Now cleanup for 0 should have started
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledWith(0);

    cleanupLock.resolve(undefined);
    await vi.advanceTimersByTimeAsync(100);
    // Now setup for 1 should have started
    expect(setup).toHaveBeenCalledWith(1);
  });
});

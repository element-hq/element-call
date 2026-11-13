/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { act, renderHook } from "@testing-library/react";
import { BehaviorSubject } from "rxjs";
import { describe, expect, test } from "vitest";
import { useCallback, useSyncExternalStore } from "react";

import { useBehavior } from "./useBehavior";
import { type Behavior } from "./state/Behavior";

/**
 * The implementation `useBehavior` replaced, kept here as proof of why. The
 * React Compiler (on for the tests as for the app) memoizes `getValue` on
 * `behavior.value`, not on `behavior`:
 *
 *     if ($[2] !== behavior.value) { t1 = () => behavior.value; ... }
 *
 * So when the hook switches to a behavior that holds the same value as the
 * prev one, `getValue` still reads the old behavior. The new behavior's
 * emissions do reach React, but the snapshot it reads is unchanged, and the
 * view is left stale. The lobby switches from a placeholder to the view
 * model's camera behavior, both starting on null, which hit exactly this.
 */
function useBehaviorExternalStore<T>(behavior: Behavior<T>): T {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const s = behavior.subscribe(onChange);
      return (): void => s.unsubscribe();
    },
    [behavior],
  );
  const getValue = useCallback(() => behavior.value, [behavior]);
  return useSyncExternalStore(subscribe, getValue);
}

/**
 * Renders the hook on one behavior, switches it to a second one holding the
 * same value, and then emits on the second.
 */
function switchToSameValue(
  hook: (behavior: Behavior<string | null>) => string | null,
): string | null {
  const first$ = new BehaviorSubject<string | null>(null);
  const second$ = new BehaviorSubject<string | null>(null);
  const { result, rerender } = renderHook(
    ({ value$ }: { value$: Behavior<string | null> }) => hook(value$),
    { initialProps: { value$: first$ } },
  );
  expect(result.current).toBeNull();

  rerender({ value$: second$ });
  act(() => second$.next("second"));
  return result.current;
}

describe("useBehavior", () => {
  test("reads the current value and follows changes", () => {
    const value$ = new BehaviorSubject(1);
    const { result } = renderHook(() => useBehavior(value$));
    expect(result.current).toBe(1);

    act(() => value$.next(2));
    expect(result.current).toBe(2);
  });

  test("follows a new behavior that starts on the same value", () => {
    expect(switchToSameValue(useBehavior)).toBe("second");
  });

  test("does not follow the behavior it switched away from", () => {
    const first$ = new BehaviorSubject<string | null>(null);
    const second$ = new BehaviorSubject<string | null>(null);
    const { result, rerender } = renderHook(
      ({ value$ }: { value$: Behavior<string | null> }) => useBehavior(value$),
      { initialProps: { value$: first$ } },
    );
    rerender({ value$: second$ });
    act(() => first$.next("first"));
    expect(result.current).toBeNull();
  });
});

describe("useBehaviorExternalStore", () => {
  // This asserts the bug, not the wanted behaviour: it is the reason
  // `useBehavior` does not use `useSyncExternalStore`. Should it ever fail,
  // the compiler has changed and the simpler implementation can come back.
  test("misses the emission of a new behavior that starts on the same value", () => {
    expect(switchToSameValue(useBehaviorExternalStore)).toBeNull();
  });
});

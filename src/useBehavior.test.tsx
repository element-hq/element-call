/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { act, renderHook } from "@testing-library/react";
import { BehaviorSubject } from "rxjs";
import { describe, expect, test } from "vitest";

import { useBehavior } from "./useBehavior";

describe("useBehavior", () => {
  test("reads the current value and follows changes", () => {
    const value$ = new BehaviorSubject(1);
    const { result } = renderHook(() => useBehavior(value$));
    expect(result.current).toBe(1);

    act(() => value$.next(2));
    expect(result.current).toBe(2);
  });
});

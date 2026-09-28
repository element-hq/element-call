/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { useValueBehavior } from "./useValueBehavior";

describe("useValueBehavior", () => {
  test("holds the value from the first render", () => {
    const { result } = renderHook(({ value }) => useValueBehavior(value), {
      initialProps: { value: "a" },
    });
    expect(result.current.value).toBe("a");
  });

  test("keeps one identity and takes each new value", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useValueBehavior(value),
      { initialProps: { value: "a" } },
    );
    const value$ = result.current;
    const seen: string[] = [];
    value$.subscribe((value) => seen.push(value));

    rerender({ value: "b" });
    expect(result.current).toBe(value$);
    expect(seen).toEqual(["a", "b"]);
  });
});

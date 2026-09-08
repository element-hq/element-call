/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { useStableValue } from "./useStableValue";

describe("useStableValue", () => {
  test("keeps the first identity while the contents stay equal", () => {
    const first = { skipLobby: true, fonts: ["Inter"] };
    const { result, rerender } = renderHook(
      ({ value }) => useStableValue(value),
      { initialProps: { value: first } },
    );
    expect(result.current).toBe(first);

    rerender({ value: { skipLobby: true, fonts: ["Inter"] } });
    expect(result.current).toBe(first);
  });

  test("takes the new identity once the contents change", () => {
    const first = { skipLobby: true };
    const second = { skipLobby: false };
    const { result, rerender } = renderHook(
      ({ value }) => useStableValue(value),
      { initialProps: { value: first } },
    );

    rerender({ value: second });
    expect(result.current).toBe(second);

    // And that identity is then the stable one
    rerender({ value: { skipLobby: false } });
    expect(result.current).toBe(second);
  });

  test("handles undefined, for an optional prop left out", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useStableValue(value),
      { initialProps: { value: undefined as { a: number } | undefined } },
    );
    expect(result.current).toBeUndefined();

    const given = { a: 1 };
    rerender({ value: given });
    expect(result.current).toBe(given);
  });

  test("accepts its own notion of equality", () => {
    const first = { id: 1, label: "a" };
    const { result, rerender } = renderHook(
      ({ value }) => useStableValue(value, (a, b) => a.id === b.id),
      { initialProps: { value: first } },
    );

    rerender({ value: { id: 1, label: "b" } });
    expect(result.current).toBe(first);
  });
});

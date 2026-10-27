/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";
import { BehaviorSubject } from "rxjs";

import { ObservableScope } from "../reactive/ObservableScope";
import { mapScoped } from "./mapScoped";

describe("mapScoped", () => {
  it("gives each value an item with a scope that ends with the value", () => {
    const scope = new ObservableScope();
    const source$ = new BehaviorSubject<string | null>("a");
    const ended = vi.fn();
    const items$ = mapScoped(scope, source$, (itemScope, value) => {
      itemScope.onEnd(() => ended(value));
      return value.toUpperCase();
    });
    expect(items$.value).toBe("A");

    source$.next("b");
    expect(items$.value).toBe("B");
    expect(ended).toHaveBeenCalledWith("a");

    source$.next(null);
    expect(items$.value).toBeUndefined();
    expect(ended).toHaveBeenCalledWith("b");

    source$.next("c");
    scope.end();
    expect(ended).toHaveBeenCalledWith("c");
  });
});

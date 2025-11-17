/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { catchError, of, tap, Subject, map, BehaviorSubject } from "rxjs";

import { type Behavior } from "./state/Behavior";
import { useBehavior } from "./useBehavior";
import { ObservableScope } from "./state/ObservableScope";

function TestComponent({
  behavior$,
  shouldThrow = false,
  children,
}: {
  behavior$: Behavior<string>;
  shouldThrow?: boolean;
  children: React.ReactNode;
}): React.ReactNode {
  if (shouldThrow) throw Error("Test error");

  const value = useBehavior(behavior$);

  return (
    <div>
      value: {value}
      {children}
    </div>
  );
}

describe("useBehavior", () => {
  let scope: ObservableScope;
  beforeEach(() => (scope = new ObservableScope()));
  afterEach(() => scope.end());

  it("reference test", () => {
    expect(() =>
      render(
        <TestComponent behavior$={scope.behavior(of("test"))}>
          Test
        </TestComponent>,
      ),
    ).not.toThrow();
  });
  it("should return the correct behavior", () => {
    expect(() =>
      render(
        <TestComponent
          shouldThrow={true}
          behavior$={scope.behavior(of("test"))}
        >
          Test
        </TestComponent>,
      ),
    ).toThrow("Test error");
  });

  it("useBehavior forwards the throw in obs computation", () => {
    const throwingOperation = (): string => {
      throw new Error("Test error");
    };

    expect(() => {
      const s$ = new Subject<string>();
      const b$ = scope.behavior(s$, "");
      s$.next("test");
      s$.next(throwingOperation());
      render(<TestComponent behavior$={b$}>Test</TestComponent>);
    }).toThrow("Test error");
  });

  function errorOnE(s: string): string {
    if (s === "E") throw new Error("Test error");
    return s + "CheckedForE";
  }

  it("useBehavior does not throw in caught obs computation", () => {
    console.log("hello");
    const s$ = new Subject<string>();
    const b$ = scope.behavior(s$.pipe(map(errorOnE)), "START");

    const inheritForThrowCatch$ = scope.behavior(
      b$.pipe(
        tap((v) => console.log("tap-" + v)),
        catchError((err) => {
          console.log("caught error" + err);
          return of("I caught an error and converted it to sth nicer");
        }),
      ),
    );

    s$.next("test");
    s$.next("E");
    s$.next("after error");

    expect(() => {
      render(
        <TestComponent behavior$={inheritForThrowCatch$}>Test</TestComponent>,
      );
    }).not.toThrow();
    expect(() => {
      render(<TestComponent behavior$={b$}>Test</TestComponent>);
    }).toThrow();
  });
  it("a playground to test around a little bit", () => {
    const s$ = new BehaviorSubject("initial");
    const e = new Error("Test error");

    console.log("hello");

    s$.error(e);
    // does not help to set the value afterwards if it errord once it cannot recover
    s$.next("nextval");
    const s2$ = scope.behavior(s$.pipe(catchError((e) => e.message)));
    expect(() => s$.value).toThrow(e);
    expect(() => s2$.value).not.toThrow();
  });
});

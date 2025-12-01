/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { test } from "vitest";
import { Subject } from "rxjs";

import { withTestScheduler } from "./test";
import { generateItems, pauseWhen } from "./observable";

test("pauseWhen", () => {
  withTestScheduler(({ behavior, expectObservable }) => {
    const inputMarbles = " abcdefgh-i-jk-";
    const pauseMarbles = " n-y--n-yn-y--n";
    const outputMarbles = "abc--fgh-i---k";
    expectObservable(
      behavior(inputMarbles).pipe(
        pauseWhen(behavior(pauseMarbles, { y: true, n: false })),
      ),
    ).toBe(outputMarbles);
  });
});

test("generateItems", () => {
  const scope1$ = new Subject<string>();
  const scope2$ = new Subject<string>();
  const scope3$ = new Subject<string>();
  const scope4$ = new Subject<string>();
  const scopeSubjects = [scope1$, scope2$, scope3$, scope4$];

  withTestScheduler(({ hot, expectObservable }) => {
    // Each scope should start when the input number reaches or surpasses their
    // number and end when the input number drops back below their number.
    // At the very end, unsubscribing should end all remaining scopes.
    const inputMarbles = "       123242";
    const outputMarbles = "      abcbdb";
    const subscriptionMarbles = "^-----!";
    const scope1Marbles = "      y-----n";
    const scope2Marbles = "      -y----n";
    const scope3Marbles = "      --ynyn";
    const scope4Marbles = "      ----yn";

    expectObservable(
      hot<string>(inputMarbles).pipe(
        generateItems(
          function* (input) {
            for (let i = 1; i <= +input; i++) {
              yield { keys: [i], data: undefined };
            }
          },
          (scope, data$, i) => {
            scopeSubjects[i - 1].next("y");
            scope.onEnd(() => scopeSubjects[i - 1].next("n"));
            return i.toString();
          },
        ),
      ),
      subscriptionMarbles,
    ).toBe(outputMarbles, {
      a: ["1"],
      b: ["1", "2"],
      c: ["1", "2", "3"],
      d: ["1", "2", "3", "4"],
    });

    expectObservable(scope1$).toBe(scope1Marbles);
    expectObservable(scope2$).toBe(scope2Marbles);
    expectObservable(scope3$).toBe(scope3Marbles);
    expectObservable(scope4$).toBe(scope4Marbles);
  });
});

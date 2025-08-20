/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { test } from "vitest";

import { withTestScheduler } from "./test";
import { pauseWhen } from "./observable";

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

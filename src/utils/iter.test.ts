/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { test, expect } from "vitest";

import { fillGaps } from "./iter";

test("fillGaps filters out gaps", () => {
  expect([
    ...fillGaps([1, undefined, undefined, undefined, 3], [2]),
  ]).toStrictEqual([1, 2, 3]);
});

test("fillGaps adds extra filler elements to the end", () => {
  expect([
    ...fillGaps([1, undefined, 3, undefined], [2, 4, 5, 6]),
  ]).toStrictEqual([1, 2, 3, 4, 5, 6]);
});

/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { test, expect } from "vitest";
import { shallowEquals } from "./object";

interface Thing {
  type: string;
  items: object[];
  value: number;
  extra?: object;
}

const item = {};
const withArray: Thing = { type: "a", items: [item], value: 1 };

test("shallowEquals considers an object to be equal to its shallow clone", () =>
  expect(shallowEquals(withArray, { ...withArray })).toBe(true));

test("shallowEquals detects a missing key", () => {
  expect(shallowEquals(withArray, { ...withArray, extra: item })).toBe(false);
  expect(shallowEquals({ ...withArray, extra: item }, withArray)).toBe(false);
});

test("shallowEquals detects a differing value", () =>
  expect(shallowEquals(withArray, { ...withArray, value: 2 })).toBe(false));

test("shallowEquals considers arrays with equal contents to be equal", () =>
  expect(
    shallowEquals(withArray, { ...withArray, items: [...withArray.items] }),
  ).toBe(true));

test("shallowEquals detects arrays with different contents", () =>
  expect(
    shallowEquals(withArray, { ...withArray, items: [...withArray.items, {}] }),
  ).toBe(false));

/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  test,
  vi,
  onTestFinished,
  it,
  describe,
  expect,
  beforeEach,
  afterEach,
} from "vitest";

import { MatrixLivekitMerger } from "./matrixLivekitMerger";
import { ObservableScope } from "../ObservableScope";

let testScope: ObservableScope;

beforeEach(() => {
  testScope = new ObservableScope();
});

afterEach(() => {
  testScope.end();
});

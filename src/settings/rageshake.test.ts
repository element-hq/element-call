/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, it } from "vitest";

import { init as initRageshake } from "./rageshake";

it("Logger should not crash if JSON.stringify fails", async () => {
  // JSON.stringify can throw. We want to make sure that the logger can handle this gracefully.
  await initRageshake();

  const bigIntObj = { n: 1n };
  const notStringifiable = {
    bigIntObj,
  };
  // @ts-expect-error - we want to create an object that cannot be stringified
  notStringifiable.foo = notStringifiable; // circular reference

  // ensure this cannot be stringified
  expect(() => JSON.stringify(notStringifiable)).toThrow();

  expect(() =>
    global.mx_rage_logger.log(
      1,
      "test",
      "This is a test message",
      notStringifiable,
    ),
  ).not.toThrow();
});

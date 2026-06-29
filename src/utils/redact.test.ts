/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "vitest";

import { redact } from "./redact";

test("empty object", () => {
  expect(redact({})).toEqual({});
});

test("no keys", () => {
  expect(redact({ foo: "bar" })).toEqual({ foo: "bar" });
});

test("redact one key", () => {
  expect(redact({ foo: "bar" }, "foo")).toEqual({ foo: "<redacted>" });
});

test("redact two keys", () => {
  expect(redact({ foo: "bar", bar: "foo" }, "foo", "bar")).toEqual({
    foo: "<redacted>",
    bar: "<redacted>",
  });
});

test("no redaction of unrelated keys", () => {
  expect(redact({ foo: "bar", bar: "foo" }, "foo")).toEqual({
    foo: "<redacted>",
    bar: "foo",
  });
});

test("no redaction of missing keys", () => {
  expect(
    redact({ foo: "bar" } as { foo: string; bar: string | undefined }, "bar"),
  ).toEqual({
    foo: "bar",
  });
});

test("no redaction of null values", () => {
  expect(redact({ foo: "bar", bar: null }, "bar")).toEqual({
    foo: "bar",
    bar: null,
  });
});

test("no redaction of undefined values", () => {
  expect(redact({ foo: "bar", bar: undefined }, "bar")).toEqual({
    foo: "bar",
    bar: undefined,
  });
});

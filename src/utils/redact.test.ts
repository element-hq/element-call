/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "vitest";

import { redact } from "./redact";

test("empty object", () => {
  expect(redact({})).to.deep.equal({});
});

test("no keys", () => {
  expect(redact({ foo: "bar" })).to.deep.equal({ foo: "bar" });
});

test("redact one key", () => {
  expect(redact({ foo: "bar" }, "foo")).to.deep.equal({ foo: "<redacted>" });
});

test("redact two keys", () => {
  expect(redact({ foo: "bar", bar: "foo" }, "foo", "bar")).to.deep.equal({
    foo: "<redacted>",
    bar: "<redacted>",
  });
});

test("no redaction of unrelated keys", () => {
  expect(redact({ foo: "bar", bar: "foo" }, "foo")).to.deep.equal({
    foo: "<redacted>",
    bar: "foo",
  });
});

test("no redaction of missing keys", () => {
  expect(
    redact({ foo: "bar" } as { foo: string; bar: string | undefined }, "bar"),
  ).to.deep.equal({
    foo: "bar",
  });
});

test("no redaction of null values", () => {
  expect(redact({ foo: "bar", bar: null }, "bar")).to.deep.equal({
    foo: "bar",
    bar: null,
  });
});

test("no redaction of undefined values", () => {
  expect(redact({ foo: "bar", bar: undefined }, "bar")).to.deep.equal({
    foo: "bar",
    bar: undefined,
  });
});

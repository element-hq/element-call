/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "vitest";
import { type MatrixClient } from "matrix-js-sdk";

import { hostClientSession, pendingHostClientSession } from "./ClientSession";
import { flushPromises, testScope } from "../utils/test";

const client = {} as MatrixClient;

test("a host's client is signed in from the start", () => {
  const session = hostClientSession(client);
  expect(session.state$.value).toEqual({
    state: "signedIn",
    client,
    passwordlessUser: false,
  });
});

test("a pending host client is loading until it arrives", async () => {
  const session = pendingHostClientSession(
    testScope(),
    Promise.resolve(client),
  );
  expect(session.state$.value).toEqual({ state: "loading" });
  await flushPromises();
  expect(session.state$.value).toEqual({
    state: "signedIn",
    client,
    passwordlessUser: false,
  });
});

test("a pending host client that never arrives is an error", async () => {
  const error = new Error("no widget API");
  const session = pendingHostClientSession(testScope(), Promise.reject(error));
  await flushPromises();
  // An error page rather than a spinner that never ends
  expect(session.state$.value).toEqual({ state: "error", error });
});

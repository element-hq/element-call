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
  // The host owns the session, so there is nothing for Element Call to do to it
  expect(session.login).toBeUndefined();
  expect(session.register).toBeUndefined();
  expect(session.logout).toBeUndefined();
  expect(session.changePassword).toBeUndefined();
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

test("a pending host client that never arrives stays loading", async () => {
  const session = pendingHostClientSession(
    testScope(),
    Promise.reject(new Error("no widget API")),
  );
  await flushPromises();
  expect(session.state$.value).toEqual({ state: "loading" });
});

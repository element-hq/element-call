/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { type MatrixClient } from "matrix-js-sdk";
import { BehaviorSubject } from "rxjs";

import { HomePage } from "./HomePage";
import { ClientContextProvider } from "../ClientContext";
import { type ClientSessionState } from "../state/ClientSession";

vi.mock("./RegisteredView", () => ({
  RegisteredView: ({ client }: { client: MatrixClient }) => (
    <span>registered as {client.getUserId()}</span>
  ),
}));
vi.mock("./UnauthenticatedView", () => ({
  UnauthenticatedView: () => <span>unauthenticated</span>,
}));

test("waits for the session to be restored", () => {
  renderHome({ state: "loading" });
  expect(screen.getByRole("heading", { name: "Loading…" })).toBeVisible();
});

test("shows the session's error", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  renderHome({ state: "error", error: new Error("Opened elsewhere") });
  expect(screen.getByText("Something went wrong")).toBeVisible();
});

test("welcomes a signed-in user", () => {
  renderHome({
    state: "signedIn",
    client: { getUserId: () => "@alice:example.org" } as MatrixClient,
    passwordlessUser: false,
  });
  expect(screen.getByText("registered as @alice:example.org")).toBeVisible();
});

test("invites a signed-out user to start a call", () => {
  renderHome({ state: "signedOut" });
  expect(screen.getByText("unauthenticated")).toBeVisible();
});

function renderHome(state: ClientSessionState): void {
  render(
    <BrowserRouter>
      <ClientContextProvider
        value={{ state$: new BehaviorSubject<ClientSessionState>(state) }}
      >
        <HomePage />
      </ClientContextProvider>
    </BrowserRouter>,
  );
}

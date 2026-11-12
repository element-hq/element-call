/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { type MatrixClient } from "matrix-js-sdk";
import { BehaviorSubject } from "rxjs";

import { RoomPage } from "./RoomPage";
import { ClientContextProvider } from "../ClientContext";
import { type ClientSessionState } from "../state/ClientSession";
import { computeUrlParams, UrlParamsProvider } from "../UrlParams";
import { useLoadGroupCall } from "./useLoadGroupCall";

vi.mock("./useLoadGroupCall", () => ({
  useLoadGroupCall: vi.fn(() => ({ kind: "loading" })),
  CallTerminatedMessage: class extends Error {},
}));
vi.mock("./useRoomName", () => ({ useRoomName: () => null }));
vi.mock("../profile/useProfile", () => ({ useProfile: () => ({}) }));
vi.mock("../auth/useRegisterPasswordlessUser", () => ({
  useRegisterPasswordlessUser: () => ({ registerPasswordlessUser }),
}));
vi.mock("./RoomAuthView", () => ({
  RoomAuthView: () => <span>room auth view</span>,
}));
vi.mock("../home/HomePage", () => ({
  HomePage: () => <span>home page</span>,
}));
vi.mock("./CallView", () => ({
  CallView: ({ isPasswordlessUser }: { isPasswordlessUser: boolean }) => (
    <span>call view, passwordless: {String(isPasswordlessUser)}</span>
  ),
}));
vi.mock("./KnockLobbyView", () => ({ KnockLobbyView: () => null }));

const registerPasswordlessUser = vi.fn().mockResolvedValue(undefined);

afterEach(() => vi.clearAllMocks());

test("waits for the session to be restored", () => {
  renderRoom({ state: "loading" }, "/call");
  expect(screen.getByRole("heading", { name: "Loading…" })).toBeVisible();
});

test("asks a signed-out user to join as a guest", () => {
  renderRoom({ state: "signedOut" }, "/call");
  expect(screen.getByText("room auth view")).toBeVisible();
  expect(registerPasswordlessUser).not.toHaveBeenCalled();
});

test("registers a passwordless user when the URL names one", () => {
  renderRoom({ state: "signedOut" }, "/call", "Alice");
  expect(registerPasswordlessUser).toHaveBeenCalledWith("Alice");
});

test("falls back to the home page without a room", () => {
  renderRoom(signedIn(false), "/");
  expect(screen.getByText("home page")).toBeVisible();
});

test("tells the call whether its user is passwordless", () => {
  vi.mocked(useLoadGroupCall).mockReturnValue({
    kind: "loaded",
    rtcSession: { room: {} },
  } as unknown as ReturnType<typeof useLoadGroupCall>);

  renderRoom(signedIn(true), "/call");
  expect(screen.getByText("call view, passwordless: true")).toBeVisible();
});

function signedIn(passwordlessUser: boolean): ClientSessionState {
  return {
    state: "signedIn",
    client: { getUserId: () => "@alice:example.org" } as MatrixClient,
    passwordlessUser,
  };
}

function renderRoom(
  state: ClientSessionState,
  path: string,
  displayName: string | null = null,
): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <UrlParamsProvider value={{ ...computeUrlParams(), displayName }}>
        <ClientContextProvider
          value={{ state$: new BehaviorSubject<ClientSessionState>(state) }}
        >
          <RoomPage />
        </ClientContextProvider>
      </UrlParamsProvider>
    </MemoryRouter>,
  );
}

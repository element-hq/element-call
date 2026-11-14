/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type FC } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { type MatrixClient } from "matrix-js-sdk";
import { BehaviorSubject } from "rxjs";

import { RegisterPage } from "./RegisterPage";
import { ClientContextProvider, ClientManagerProvider } from "../ClientContext";
import {
  type ClientManager,
  type ClientSessionState,
} from "../state/ClientSession";

vi.mock("./useRecaptcha", () => ({
  useRecaptcha: () => ({
    execute: vi.fn().mockResolvedValue("captcha-response"),
    reset,
    recaptchaId: "recaptcha",
  }),
}));
vi.mock("./useRegistrationTerms", () => ({
  useRegistrationTerms: () => ({ recaptchaKey: "site-key" }),
}));

const reset = vi.fn();

afterEach(() => vi.clearAllMocks());

test("waits for the session to be restored", () => {
  renderRegister({ state: "loading" }, mockManager());
  expect(screen.getByRole("heading", { name: "Loading…" })).toBeVisible();
});

test("registers an account, signs in and goes home", async () => {
  const manager = mockManager();
  const setSignedIn = vi.fn();
  vi.mocked(manager.register).mockResolvedValue({
    client: {} as MatrixClient,
    setSignedIn,
  });
  renderRegister({ state: "signedOut" }, manager);

  await submit("alice", "hunter2");

  expect(manager.register).toHaveBeenCalledWith(
    "alice",
    "hunter2",
    "alice",
    "captcha-response",
    false,
  );
  expect(setSignedIn).toHaveBeenCalled();
  expect(await screen.findByText("at /")).toBeVisible();
});

test("upgrades a passwordless user to a full account", async () => {
  const manager = mockManager();
  vi.mocked(manager.register).mockResolvedValue({
    client: {} as MatrixClient,
    setSignedIn: vi.fn(),
  });
  renderRegister(
    {
      state: "signedIn",
      client: { getUserId: () => "@guest:example.org" } as MatrixClient,
      passwordlessUser: true,
    },
    manager,
  );

  await submit("alice", "hunter2");

  expect(manager.register).toHaveBeenCalledWith(
    "alice",
    "hunter2",
    "alice",
    "captcha-response",
    true,
  );
});

test("shows why registering failed and resets the captcha", async () => {
  const manager = mockManager();
  vi.mocked(manager.register).mockRejectedValue(new Error("Name taken"));
  renderRegister({ state: "signedOut" }, manager);

  await submit("alice", "hunter2");

  expect(await screen.findByText("Name taken")).toBeVisible();
  expect(reset).toHaveBeenCalled();
  expect(screen.getByText("at /register")).toBeVisible();
});

async function submit(username: string, password: string): Promise<void> {
  const user = userEvent.setup();
  await user.type(screen.getByTestId("register_username"), username);
  await user.type(screen.getByTestId("register_password"), password);
  await user.type(screen.getByTestId("register_confirm_password"), password);
  await user.click(screen.getByTestId("register_register"));
}

function mockManager(): ClientManager {
  return { login: vi.fn(), register: vi.fn(), logout: vi.fn() };
}

const WhereAmI: FC = () => <span>at {useLocation().pathname}</span>;

function renderRegister(
  state: ClientSessionState,
  manager: ClientManager,
): void {
  render(
    <MemoryRouter initialEntries={["/register"]}>
      <ClientContextProvider
        value={{ state$: new BehaviorSubject<ClientSessionState>(state) }}
      >
        <ClientManagerProvider value={manager}>
          <RegisterPage />
          <WhereAmI />
        </ClientManagerProvider>
      </ClientContextProvider>
    </MemoryRouter>,
  );
}

/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type FC } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { type MatrixClient } from "matrix-js-sdk";

import { LoginPage } from "./LoginPage";
import { ClientManagerProvider } from "../ClientContext";
import { type ClientManager } from "../state/ClientSession";
import { Config } from "../config/Config";

beforeEach(() => {
  vi.spyOn(Config, "defaultHomeserverUrl").mockReturnValue(
    "https://hs.example.org",
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

test("signs in with the session's manager and goes home", async () => {
  const manager = mockManager();
  vi.mocked(manager.login).mockResolvedValue({} as MatrixClient);
  renderLogin(manager);

  await submit("alice", "hunter2");

  expect(manager.login).toHaveBeenCalledWith(
    "https://hs.example.org",
    "alice",
    "hunter2",
  );
  expect(await screen.findByText("at /")).toBeVisible();
});

test("shows why signing in failed", async () => {
  const manager = mockManager();
  vi.mocked(manager.login).mockRejectedValue(new Error("Wrong password"));
  renderLogin(manager);

  await submit("alice", "hunter2");

  expect(await screen.findByText("Wrong password")).toBeVisible();
  expect(screen.getByText("at /login")).toBeVisible();
});

async function submit(username: string, password: string): Promise<void> {
  const user = userEvent.setup();
  await user.type(screen.getByTestId("login_username"), username);
  await user.type(screen.getByTestId("login_password"), password);
  await user.click(screen.getByTestId("login_login"));
}

function mockManager(): ClientManager {
  return { login: vi.fn(), register: vi.fn(), logout: vi.fn() };
}

const WhereAmI: FC = () => <span>at {useLocation().pathname}</span>;

function renderLogin(manager: ClientManager): void {
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <ClientManagerProvider value={manager}>
        <LoginPage />
        <WhereAmI />
      </ClientManagerProvider>
    </MemoryRouter>,
  );
}

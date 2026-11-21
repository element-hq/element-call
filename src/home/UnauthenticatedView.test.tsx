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

import { UnauthenticatedView } from "./UnauthenticatedView";
import { ClientManagerProvider } from "../ClientContext";
import { type ClientManager } from "../state/ClientSession";
import { computeUrlParams, UrlParamsProvider } from "../UrlParams";
import type * as matrixUtils from "../utils/matrix";
import { createRoom, getRelativeRoomUrl } from "../utils/matrix";
import { E2eeType } from "../e2ee/e2eeType";

vi.mock("../auth/useRecaptcha", () => ({
  useRecaptcha: () => ({
    execute: vi.fn().mockResolvedValue("captcha-response"),
    reset,
    recaptchaId: "recaptcha",
  }),
}));
vi.mock("../auth/useRegistrationTerms", () => ({
  useRegistrationTerms: () => ({ recaptchaKey: "site-key" }),
}));
vi.mock("../auth/generateRandomName", () => ({
  generateRandomName: () => "Random Name",
}));
vi.mock("../utils/matrix", async (importOriginal) => ({
  ...(await importOriginal<typeof matrixUtils>()),
  createRoom: vi.fn(),
}));
vi.mock("../UserMenuContainer", () => ({ UserMenuContainer: () => null }));

const reset = vi.fn();
const client = {} as MatrixClient;

afterEach(() => vi.clearAllMocks());

test("registers a guest, creates their call and signs them in", async () => {
  const manager = mockManager();
  const setSignedIn = vi.fn();
  vi.mocked(manager.register).mockResolvedValue({ client, setSignedIn });
  vi.mocked(createRoom).mockResolvedValue({
    roomId: "!call:example.org",
    alias: "#my-call:example.org",
    password: "secret",
  });
  renderView(manager);

  await submit("My Call", "Alice");

  expect(manager.register).toHaveBeenCalledWith(
    "Random Name",
    expect.stringMatching(/^.{16}$/),
    "Alice",
    "captcha-response",
    true,
  );
  expect(createRoom).toHaveBeenCalledWith(
    client,
    "My Call",
    E2eeType.SHARED_KEY,
  );
  expect(setSignedIn).toHaveBeenCalled();
  const url = getRelativeRoomUrl(
    "!call:example.org",
    { kind: E2eeType.SHARED_KEY, secret: "secret" },
    "My Call",
  );
  expect(await screen.findByText(`at ${url}`)).toBeVisible();
});

test("signs in only once the user chooses to join a call that exists", async () => {
  const manager = mockManager();
  const setSignedIn = vi.fn();
  vi.mocked(manager.register).mockResolvedValue({ client, setSignedIn });
  vi.mocked(createRoom).mockRejectedValue({ errcode: "M_ROOM_IN_USE" });
  renderView(manager);

  await submit("My Call", "Alice");

  const join = await screen.findByRole("button", { name: "Yes, join call" });
  expect(setSignedIn).not.toHaveBeenCalled();
  await userEvent.click(join);
  expect(setSignedIn).toHaveBeenCalled();
  expect(await screen.findByText("at /my-call")).toBeVisible();
});

test("shows why registering failed and resets the captcha", async () => {
  const manager = mockManager();
  vi.mocked(manager.register).mockRejectedValue(new Error("Rate limited"));
  renderView(manager);

  await submit("My Call", "Alice");

  expect(await screen.findByText("Rate limited")).toBeVisible();
  expect(reset).toHaveBeenCalled();
  expect(createRoom).not.toHaveBeenCalled();
});

async function submit(callName: string, displayName: string): Promise<void> {
  const user = userEvent.setup();
  await user.type(screen.getByTestId("home_callName"), callName);
  await user.type(screen.getByTestId("home_displayName"), displayName);
  await user.click(screen.getByTestId("home_go"));
}

function mockManager(): ClientManager {
  return { login: vi.fn(), register: vi.fn(), logout: vi.fn() };
}

const WhereAmI: FC = () => {
  const { pathname, search, hash } = useLocation();
  return <span>{`at ${pathname}${search}${hash}`}</span>;
};

function renderView(manager: ClientManager): void {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <UrlParamsProvider value={computeUrlParams()}>
        <ClientManagerProvider value={manager}>
          <UnauthenticatedView />
          <WhereAmI />
        </ClientManagerProvider>
      </UrlParamsProvider>
    </MemoryRouter>,
  );
}

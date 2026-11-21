/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, expect, test, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { type FC, type PropsWithChildren } from "react";
import { type MatrixClient } from "matrix-js-sdk";

import { useRegisterPasswordlessUser } from "./useRegisterPasswordlessUser";
import { ClientManagerProvider } from "../ClientContext";
import { type ClientManager } from "../state/ClientSession";
import { computeUrlParams, UrlParamsProvider } from "../UrlParams";

vi.mock("./useRecaptcha", () => ({
  useRecaptcha: () => ({
    execute: vi.fn().mockResolvedValue("captcha-response"),
    reset,
    recaptchaId: "recaptcha",
  }),
}));
vi.mock("./useRegistrationTerms", () => ({
  useRegistrationTerms: () => ({
    privacyPolicyUrl: "https://hs.example.org/privacy",
    recaptchaKey: "site-key",
  }),
}));
vi.mock("./generateRandomName", () => ({
  generateRandomName: () => "Random Name",
}));

const reset = vi.fn();

afterEach(() => vi.clearAllMocks());

test("registers a user under a random name and signs them in", async () => {
  const setSignedIn = vi.fn();
  const manager = mockManager();
  vi.mocked(manager.register).mockResolvedValue({
    client: {} as MatrixClient,
    setSignedIn,
  });

  const { result } = renderHook(() => useRegisterPasswordlessUser(), {
    wrapper: wrapper(manager, false),
  });
  await result.current.registerPasswordlessUser("Alice");

  expect(manager.register).toHaveBeenCalledWith(
    "Random Name",
    expect.stringMatching(/^.{16}$/),
    "Alice",
    "captcha-response",
    true,
  );
  expect(setSignedIn).toHaveBeenCalled();
  expect(result.current.privacyPolicyUrl).toBe(
    "https://hs.example.org/privacy",
  );
  expect(result.current.recaptchaId).toBe("recaptcha");
});

test("resets the captcha when registration fails", async () => {
  const manager = mockManager();
  vi.mocked(manager.register).mockRejectedValue(new Error("Nope"));

  const { result } = renderHook(() => useRegisterPasswordlessUser(), {
    wrapper: wrapper(manager, false),
  });

  await expect(
    result.current.registerPasswordlessUser("Alice"),
  ).rejects.toThrow("Nope");
  expect(reset).toHaveBeenCalled();
});

test("cannot register on a session that is not ours", async () => {
  const { result } = renderHook(() => useRegisterPasswordlessUser(), {
    wrapper: wrapper(null, false),
  });

  await expect(
    result.current.registerPasswordlessUser("Alice"),
  ).rejects.toThrow("This session cannot register");
});

test("never registers as a widget", async () => {
  const manager = mockManager();
  const { result } = renderHook(() => useRegisterPasswordlessUser(), {
    wrapper: wrapper(manager, true),
  });

  await expect(
    result.current.registerPasswordlessUser("Alice"),
  ).rejects.toThrow(/embedded mode/);
  expect(manager.register).not.toHaveBeenCalled();
});

function mockManager(): ClientManager {
  return { login: vi.fn(), register: vi.fn(), logout: vi.fn() };
}

function wrapper(
  manager: ClientManager | null,
  isWidget: boolean,
): FC<PropsWithChildren> {
  const params = { ...computeUrlParams(), isWidget };
  return ({ children }) => (
    <UrlParamsProvider value={params}>
      <ClientManagerProvider value={manager}>{children}</ClientManagerProvider>
    </UrlParamsProvider>
  );
}

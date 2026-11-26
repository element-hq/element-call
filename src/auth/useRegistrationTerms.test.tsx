/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type * as MatrixJsSdk from "matrix-js-sdk";
import { createClient, type MatrixClient } from "matrix-js-sdk";
import { type FC, type PropsWithChildren } from "react";

import { useRegistrationTerms } from "./useRegistrationTerms";
import { computeUrlParams, UrlParamsProvider } from "../UrlParams";
import { Config } from "../config/Config";

vi.mock("matrix-js-sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof MatrixJsSdk>()),
  createClient: vi.fn(),
}));

const registerRequest = vi.fn();

beforeEach(() => {
  vi.spyOn(Config, "defaultHomeserverUrl").mockReturnValue(
    "https://hs.example.org",
  );
  vi.mocked(createClient).mockReturnValue({
    registerRequest,
  } as Partial<MatrixClient> as MatrixClient);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

test("reads the terms the homeserver asks for from a registration attempt", async () => {
  registerRequest.mockRejectedValue({
    data: {
      params: {
        "m.login.terms": {
          policies: {
            privacy_policy: { en: { url: "https://hs.example.org/privacy" } },
          },
        },
        "m.login.recaptcha": { public_key: "site-key" },
      },
    },
  });

  const { result } = renderHook(() => useRegistrationTerms(), {
    wrapper: wrapper(false),
  });

  expect(createClient).toHaveBeenCalledWith({
    baseUrl: "https://hs.example.org",
  });
  await waitFor(() =>
    expect(result.current).toEqual({
      privacyPolicyUrl: "https://hs.example.org/privacy",
      recaptchaKey: "site-key",
    }),
  );
});

test("has nothing to agree to where the homeserver asks for nothing", async () => {
  registerRequest.mockRejectedValue({ data: { params: {} } });

  const { result } = renderHook(() => useRegistrationTerms(), {
    wrapper: wrapper(false),
  });

  await waitFor(() => expect(registerRequest).toHaveBeenCalled());
  expect(result.current).toEqual({
    privacyPolicyUrl: undefined,
    recaptchaKey: undefined,
  });
});

test("asks the homeserver nothing as a widget", () => {
  const { result } = renderHook(() => useRegistrationTerms(), {
    wrapper: wrapper(true),
  });

  expect(createClient).not.toHaveBeenCalled();
  expect(result.current).toEqual({
    privacyPolicyUrl: undefined,
    recaptchaKey: undefined,
  });
});

function wrapper(isWidget: boolean): FC<PropsWithChildren> {
  const params = { ...computeUrlParams(), isWidget };
  return ({ children }) => (
    <UrlParamsProvider value={params}>{children}</UrlParamsProvider>
  );
}

/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, expect, test, vi } from "vitest";
import { createClient, type MatrixClient, MatrixError } from "matrix-js-sdk";
import type * as MatrixJsSdk from "matrix-js-sdk";

import { loginWithPassword, registerWithPassword } from "./interactiveAuth";

vi.mock("matrix-js-sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof MatrixJsSdk>()),
  createClient: vi.fn(),
}));

const credentials = {
  user_id: "@alice:example.org",
  device_id: "AAAA",
  access_token: "secret",
};

// What interactive auth asks of the client besides the request itself
const authClient = { generateClientSecret: () => "client-secret" };

afterEach(() => {
  vi.clearAllMocks();
});

test("logs in with a password", async () => {
  const login = vi.fn().mockResolvedValue({ ...credentials, extra: "ignored" });
  vi.mocked(createClient).mockReturnValue({
    ...authClient,
    login,
  } as Partial<MatrixClient> as MatrixClient);

  await expect(
    loginWithPassword("https://hs.example.org", "alice", "hunter2"),
  ).resolves.toEqual(credentials);

  expect(createClient).toHaveBeenCalledWith({
    baseUrl: "https://hs.example.org",
  });
  expect(login).toHaveBeenCalledWith("m.login.password", {
    identifier: { type: "m.id.user", user: "alice" },
    password: "hunter2",
  });
});

test("registers, agreeing to the terms and answering the recaptcha", async () => {
  // The homeserver turns the first request away with the stages to complete
  // No error in it: that is the shape of a challenge rather than a refusal
  const challenge = new MatrixError(
    {
      session: "session",
      flows: [{ stages: ["m.login.terms", "m.login.recaptcha"] }],
      params: {},
      completed: [],
    },
    401,
  );
  const registerRequest = vi
    .fn()
    .mockImplementation(({ auth }: { auth?: { type: string } }) => {
      if (auth === undefined) throw challenge;
      challenge.data.completed = [
        ...(challenge.data.completed as string[]),
        auth.type,
      ];
      if (challenge.data.completed.length < 2) throw challenge;
      return credentials;
    });
  vi.mocked(createClient).mockReturnValue({
    ...authClient,
    registerRequest,
  } as Partial<MatrixClient> as MatrixClient);

  await expect(
    registerWithPassword(
      "https://hs.example.org",
      "alice",
      "hunter2",
      "captcha",
    ),
  ).resolves.toEqual(credentials);

  expect(registerRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      username: "alice",
      password: "hunter2",
      auth: expect.objectContaining({ type: "m.login.terms" }),
    }),
  );
  expect(registerRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      auth: expect.objectContaining({
        type: "m.login.recaptcha",
        response: "captcha",
      }),
    }),
  );
});

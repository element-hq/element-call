/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { type MatrixClient, MatrixError, type User } from "matrix-js-sdk";

import { StandaloneClientSession } from "./StandaloneClientSession";
import { type StoredSession } from "./ClientSession";
import { initClient } from "../utils/initClient";
import {
  loginWithPassword,
  registerWithPassword,
} from "../auth/interactiveAuth";
import { PosthogAnalytics } from "../analytics/PosthogAnalytics";
import { Config } from "../config/Config";
import { OpenElsewhereError } from "../RichError";
import { flushPromises, testScope } from "../utils/test";

vi.mock("../utils/initClient", () => ({ initClient: vi.fn() }));
vi.mock("../auth/interactiveAuth", () => ({
  loginWithPassword: vi.fn(),
  registerWithPassword: vi.fn(),
}));

const SESSION_KEY = "matrix-auth-store";

const session: StoredSession = {
  user_id: "@alice:example.org",
  device_id: "AAAA",
  access_token: "secret",
  passwordlessUser: true,
};

const user = { setRawDisplayName: vi.fn(), setDisplayName: vi.fn() };
const mockClient = (): MatrixClient =>
  ({
    stopClient: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    clearStores: vi.fn().mockResolvedValue(undefined),
    setDisplayName: vi.fn().mockResolvedValue(undefined),
    getUserId: () => session.user_id,
    getUser: () => user as unknown as User,
  }) as Partial<MatrixClient> as MatrixClient;

const credentials = {
  user_id: "@bob:example.org",
  device_id: "BBBB",
  access_token: "fresh",
};

const storeSession = (): void =>
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
const storedSession = (): StoredSession | null =>
  JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");

beforeEach(() => {
  vi.spyOn(Config, "init").mockResolvedValue(undefined);
  vi.spyOn(Config, "defaultHomeserverUrl").mockReturnValue(
    "https://hs.example.org",
  );
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

test("restores the stored session once the config is loaded", async () => {
  storeSession();
  const client = mockClient();
  vi.mocked(initClient).mockResolvedValue(client);

  const clientSession = new StandaloneClientSession(testScope());
  expect(clientSession.state$.value).toEqual({ state: "loading" });

  await flushPromises();
  expect(Config.init).toHaveBeenCalled();
  expect(initClient).toHaveBeenCalledWith(
    expect.objectContaining({
      baseUrl: "https://hs.example.org",
      accessToken: "secret",
      userId: "@alice:example.org",
      deviceId: "AAAA",
    }),
    // Restoring: the crypto store is the session's, not to be wiped
    true,
  );
  expect(clientSession.state$.value).toEqual({
    state: "signedIn",
    client,
    passwordlessUser: true,
  });
});

test("has no one signed in when there is no session to restore", async () => {
  const clientSession = new StandaloneClientSession(testScope());
  await flushPromises();
  expect(initClient).not.toHaveBeenCalled();
  expect(clientSession.state$.value).toEqual({ state: "signedOut" });
});

test("drops a session the homeserver no longer knows", async () => {
  storeSession();
  vi.mocked(initClient).mockRejectedValue(
    new MatrixError({ errcode: "M_UNKNOWN_TOKEN", error: "Unknown token" }),
  );
  const clientSession = new StandaloneClientSession(testScope());
  await flushPromises();
  expect(storedSession()).toBeNull();
  expect(clientSession.state$.value).toEqual({ state: "signedOut" });
});

test("drops the session and reports any other error", async () => {
  storeSession();
  const error = new Error("offline");
  vi.mocked(initClient).mockRejectedValue(error);
  const clientSession = new StandaloneClientSession(testScope());
  await flushPromises();
  expect(storedSession()).toBeNull();
  // An error page rather than a spinner that never ends
  expect(clientSession.state$.value).toEqual({ state: "error", error });
});

test("logs in with a password, ending the session it had", async () => {
  storeSession();
  const restored = mockClient();
  vi.mocked(initClient).mockResolvedValueOnce(restored);
  const clientSession = new StandaloneClientSession(testScope());
  await flushPromises();

  const client = mockClient();
  vi.mocked(loginWithPassword).mockResolvedValue(credentials);
  vi.mocked(initClient).mockResolvedValueOnce(client);
  await expect(
    clientSession.login("https://other.example.org", "bob", "hunter2"),
  ).resolves.toBe(client);

  expect(loginWithPassword).toHaveBeenCalledWith(
    "https://other.example.org",
    "bob",
    "hunter2",
  );
  // The old session is logged out before the new client starts, so that the
  // crypto stores are not shared between the two
  expect(restored.logout).toHaveBeenCalledWith(true);
  expect(initClient).toHaveBeenLastCalledWith(
    {
      baseUrl: "https://other.example.org",
      accessToken: "fresh",
      userId: "@bob:example.org",
      deviceId: "BBBB",
    },
    false,
  );
  expect(clientSession.state$.value).toEqual({
    state: "signedIn",
    client,
    passwordlessUser: false,
  });
  expect(storedSession()).toEqual({ ...credentials, passwordlessUser: false });
});

test("registers a passwordless account, signing in only when asked", async () => {
  const clientSession = new StandaloneClientSession(testScope());
  await flushPromises();

  const client = mockClient();
  vi.mocked(registerWithPassword).mockResolvedValue(credentials);
  vi.mocked(initClient).mockResolvedValue(client);
  const registration = await clientSession.register(
    "bob",
    "temporary",
    "Bob",
    "captcha",
    true,
  );

  expect(registerWithPassword).toHaveBeenCalledWith(
    "https://hs.example.org",
    "bob",
    "temporary",
    "captcha",
  );
  expect(registration.client).toBe(client);
  expect(client.setDisplayName).toHaveBeenCalledWith("Bob");
  expect(user.setDisplayName).toHaveBeenCalledWith("Bob");
  // Registered, but not yet signed in: the caller may still be setting up
  expect(clientSession.state$.value).toEqual({ state: "signedOut" });
  expect(storedSession()).toBeNull();

  registration.setSignedIn();
  expect(clientSession.state$.value).toEqual({
    state: "signedIn",
    client,
    passwordlessUser: true,
  });
  expect(storedSession()).toEqual({ ...credentials, passwordlessUser: true });
});

test("registers an account with a password of its own", async () => {
  const clientSession = new StandaloneClientSession(testScope());
  await flushPromises();
  vi.mocked(registerWithPassword).mockResolvedValue(credentials);
  vi.mocked(initClient).mockResolvedValue(mockClient());

  const { setSignedIn } = await clientSession.register(
    "bob",
    "hunter2",
    "Bob",
    "captcha",
    false,
  );
  setSignedIn();

  expect(storedSession()).toEqual({ ...credentials, passwordlessUser: false });
});

test("logs out, clearing the client's stores and the stored session", async () => {
  storeSession();
  const client = mockClient();
  vi.mocked(initClient).mockResolvedValue(client);
  const clientSession = new StandaloneClientSession(testScope());
  await flushPromises();

  const analyticsLogout = vi.spyOn(PosthogAnalytics.instance, "logout");

  await clientSession.logout();

  expect(client.logout).toHaveBeenCalledWith(true);
  expect(client.clearStores).toHaveBeenCalled();
  expect(storedSession()).toBeNull();
  expect(clientSession.state$.value).toEqual({ state: "signedOut" });
  // Analytics forget the user along with the session
  expect(analyticsLogout).toHaveBeenCalled();
});

test("claims exclusive use of storage from other instances of the app", () => {
  // The channel is created with the session, so spy on the prototype rather
  // than trying to replace the global.
  const postMessage = vi.spyOn(BroadcastChannel.prototype, "postMessage");
  new StandaloneClientSession(testScope());
  expect(postMessage).toHaveBeenCalled();
});

test("stops when another instance of the app claims storage", async () => {
  storeSession();
  const client = mockClient();
  vi.mocked(initClient).mockResolvedValue(client);
  const clientSession = new StandaloneClientSession(testScope());
  await flushPromises();

  new BroadcastChannel("load").postMessage({});
  await vi.waitFor(() =>
    expect(clientSession.state$.value).toMatchObject({ state: "error" }),
  );
  expect(client.stopClient).toHaveBeenCalled();
  const { value } = clientSession.state$;
  expect(value.state === "error" && value.error).toBeInstanceOf(
    OpenElsewhereError,
  );
});

/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type MatrixClient, MatrixError } from "matrix-js-sdk";

import { initClient } from "./initClient";
import { initSPA } from "./spa";
import { Config } from "../config/Config";
import { type Session } from "../ClientContext";

vi.mock("./initClient", () => ({ initClient: vi.fn() }));

const session: Session = {
  user_id: "@alice:example.org",
  device_id: "AAAA",
  access_token: "secret",
  passwordlessUser: true,
};
const client = {} as MatrixClient;

describe("initSPA", () => {
  const clearSession = vi.fn();

  beforeEach(() => {
    vi.spyOn(Config, "defaultHomeserverUrl").mockReturnValue(
      "https://hs.example.org",
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("continues without a client when no session is stored", async () => {
    await expect(initSPA(() => undefined, clearSession)).resolves.toBeNull();

    expect(initClient).not.toHaveBeenCalled();
    expect(clearSession).not.toHaveBeenCalled();
  });

  it("restores the stored session into a client", async () => {
    vi.mocked(initClient).mockResolvedValue(client);

    await expect(initSPA(() => session, clearSession)).resolves.toEqual({
      client,
      passwordlessUser: true,
    });

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
  });

  it("drops a session the homeserver no longer knows", async () => {
    vi.mocked(initClient).mockRejectedValue(
      new MatrixError({ errcode: "M_UNKNOWN_TOKEN", error: "Unknown token" }),
    );

    await expect(initSPA(() => session, clearSession)).resolves.toBeNull();
    expect(clearSession).toHaveBeenCalled();
  });

  it("drops the session and fails on any other error", async () => {
    vi.mocked(initClient).mockRejectedValue(new Error("offline"));

    await expect(initSPA(() => session, clearSession)).rejects.toThrow(
      "offline",
    );
    expect(clearSession).toHaveBeenCalled();
  });
});

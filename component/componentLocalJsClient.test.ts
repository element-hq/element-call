/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, expect, test, vi } from "vitest";
import {
  ClientEvent,
  ConnectionError,
  EventType,
  type MatrixClient,
  SyncState,
} from "matrix-js-sdk";

import { createComponentLocalJsClient } from "./componentLocalJsClient";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("reads the host's live state from the host's client", () => {
  const host = mockHost();
  const client = createComponentLocalJsClient(host);
  const listener = (): void => {};

  expect(client.getSyncState()).toBe(SyncState.Syncing);
  client.on(ClientEvent.Sync, listener);
  client.off(ClientEvent.Sync, listener);
  client.getUser("@bob:example.org");
  client.getCrypto();

  expect(host.getSyncState).toHaveBeenCalledOnce();
  expect(host.on).toHaveBeenCalledWith(ClientEvent.Sync, listener);
  expect(host.off).toHaveBeenCalledWith(ClientEvent.Sync, listener);
  expect(host.getUser).toHaveBeenCalledWith("@bob:example.org");
  expect(host.getCrypto).toHaveBeenCalledOnce();
});

test("sends the RTC session's encrypted events with the host's crypto", async () => {
  const host = mockHost();
  const client = createComponentLocalJsClient(host);

  await client._unstable_sendStickyEvent(
    "!room:example.org",
    1000,
    null,
    EventType.RTCMembership,
    { slot_id: "m.call#ROOM", msc4354_sticky_key: "key" },
  );
  await client.encryptAndSendToDevice("m.room.encrypted", [], {});

  expect(host._unstable_sendStickyEvent).toHaveBeenCalledOnce();
  expect(host.encryptAndSendToDevice).toHaveBeenCalledOnce();
});

test.each([
  "sendEvent",
  "redactEvent",
  "decryptEventIfNeeded",
  "_unstable_sendStickyEvent",
  "_unstable_sendStickyDelayedEvent",
  "encryptAndSendToDevice",
  "sendStateEvent",
  "setDisplayName",
  "setAvatarUrl",
  "uploadContent",
  "doesServerSupportUnstableFeature",
] as const)(
  "the host's %s fails with errors our js-sdk recognises",
  async (method) => {
    const host = mockHost();
    // A ConnectionError of the host's own js-sdk: not ours, but shaped like it
    const hostError = Object.assign(new Error("fetch failed"), {
      name: "ConnectionError",
    });
    vi.mocked(host[method]).mockRejectedValue(hostError);
    const client = createComponentLocalJsClient(host);

    await expect(
      (client[method] as () => Promise<unknown>)(),
    ).rejects.toBeInstanceOf(ConnectionError);
  },
);

test("takes its credentials from the host", () => {
  const client = createComponentLocalJsClient(mockHost());

  expect(client.getUserId()).toBe("@alice:example.org");
  expect(client.getDeviceId()).toBe("DEVICE");
  expect(client.getDomain()).toBe("example.org");
  expect(client.baseUrl).toBe("https://matrix.example.org");
});

test("makes requests with whichever token the host holds now", async () => {
  const fetch = vi.fn(
    async () =>
      await Promise.resolve(
        new Response(JSON.stringify({ access_token: "openid" }), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  const host = mockHost();
  const client = createComponentLocalJsClient(host);
  // As if the host had refreshed its token after we were created
  host.token = "refreshed";

  await client.getOpenIdToken();

  expect(fetch).toHaveBeenCalledOnce();
  const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
  expect(url.toString()).toBe(
    "https://matrix.example.org/_matrix/client/v3/user/%40alice%3Aexample.org/openid/request_token",
  );
  expect(new Headers(init.headers).get("Authorization")).toBe(
    "Bearer refreshed",
  );
});

function mockHost(): MatrixClient & { token: string } {
  const host = {
    token: "first",
    baseUrl: "https://matrix.example.org",
    getUserId: (): string => "@alice:example.org",
    getDeviceId: (): string => "DEVICE",
    getAccessToken: (): string => host.token,
    getSyncState: vi.fn(() => SyncState.Syncing),
    on: vi.fn(),
    off: vi.fn(),
    getUser: vi.fn(() => null),
    getCrypto: vi.fn(() => undefined),
    sendEvent: vi.fn(),
    sendStateEvent: vi.fn(),
    _unstable_sendStickyEvent: vi.fn(),
    _unstable_sendStickyDelayedEvent: vi.fn(),
    encryptAndSendToDevice: vi.fn(),
    redactEvent: vi.fn(),
    decryptEventIfNeeded: vi.fn(),
    setDisplayName: vi.fn(),
    setAvatarUrl: vi.fn(),
    uploadContent: vi.fn(),
    doesServerSupportUnstableFeature: vi.fn(),
  };
  return host as unknown as MatrixClient & { token: string };
}

/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { EventEmitter } from "events";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import {
  ClientEvent,
  createClient,
  type ICreateClientOpts,
  IndexedDBStore,
  MemoryStore,
} from "matrix-js-sdk";
import type * as MatrixSdk from "matrix-js-sdk";

import { initClient } from "./initClient";
import { flushPromises } from "./test";

interface Store {
  startup: Mock<() => Promise<void>>;
  getSavedSyncToken: Mock<() => Promise<string | null>>;
}

const store = (): Store => ({
  startup: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  getSavedSyncToken: vi
    .fn<() => Promise<string | null>>()
    .mockResolvedValue(null),
});

// The client is the SDK's business; what these tests are about is how it is
// set up: its stores, its crypto, and when it counts as ready.
vi.mock("matrix-js-sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof MatrixSdk>()),
  createClient: vi.fn(),
  IndexedDBStore: vi.fn(function (this: Store) {
    Object.assign(this, store());
  }),
  MemoryStore: vi.fn(function (this: Store) {
    Object.assign(this, store());
  }),
}));

interface FakeClient extends EventEmitter {
  store: Store;
  clearStores: Mock<() => Promise<void>>;
  initRustCrypto: Mock<() => Promise<void>>;
  startClient: Mock<() => Promise<void>>;
}

/**
 * A client that, unless told otherwise, reports its first sync a tick after
 * being started, as the real one does once the network answers.
 */
function fakeClient(opts: ICreateClientOpts, syncs = true): FakeClient {
  const client = Object.assign(new EventEmitter(), {
    store: opts.store as unknown as Store,
    clearStores: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    initRustCrypto: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    startClient: vi.fn(async () => {
      if (!syncs) return;
      await new Promise((resolve) => setTimeout(resolve, 0));
      client.emit(ClientEvent.Sync, "PREPARED", null);
    }),
  });
  return client;
}

const options: ICreateClientOpts = { baseUrl: "https://hs.example.org" };
const clients = vi.mocked(createClient) as unknown as Mock<
  (opts: ICreateClientOpts) => FakeClient
>;
const indexedDBStores = vi.mocked(IndexedDBStore);
const memoryStores = vi.mocked(MemoryStore);

describe("initClient", () => {
  beforeEach(() => {
    clients.mockImplementation((opts) => fakeClient(opts));
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("hands back the client once its first sync is done", async () => {
    const client = await initClient(options, true);

    expect(client).toBe(clients.mock.results[0].value);
    expect(client.startClient).toHaveBeenCalledWith({
      clientWellKnownPollPeriod: 600,
    });
    expect(clients).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://hs.example.org",
        useAuthorizationHeader: true,
        localTimeoutMs: 5000,
      }),
    );
  });

  it("keeps the stores when restoring a session", async () => {
    const client = (await initClient(options, true)) as unknown as FakeClient;
    expect(client.clearStores).not.toHaveBeenCalled();
  });

  it("clears the stores before starting them when not restoring", async () => {
    const client = (await initClient(options, false)) as unknown as FakeClient;

    expect(client.clearStores).toHaveBeenCalled();
    expect(client.clearStores.mock.invocationCallOrder[0]).toBeLessThan(
      client.store.startup.mock.invocationCallOrder[0],
    );
  });

  it("syncs into memory where there is no IndexedDB", async () => {
    // jsdom has no indexedDB
    const client = await initClient(options, true);

    expect(client.store).toBe(memoryStores.mock.instances[0]);
    expect(indexedDBStores).not.toHaveBeenCalled();
  });

  it("syncs into IndexedDB through a worker, where it was bundled", async () => {
    vi.stubGlobal("indexedDB", {});
    vi.stubEnv("DEV", false);

    const client = await initClient(options, true);

    expect(client.store).toBe(indexedDBStores.mock.instances[0]);
    const [storeOptions] = indexedDBStores.mock.calls[0];
    expect(storeOptions.dbName).toBe("element-call-sync");
    expect(storeOptions.workerFactory).toBeTypeOf("function");
  });

  it("syncs into IndexedDB without a worker in development", async () => {
    vi.stubGlobal("indexedDB", {});
    vi.stubEnv("DEV", true);

    await initClient(options, true);

    // The dev server does not bundle the worker
    expect(indexedDBStores.mock.calls[0][0].workerFactory).toBeUndefined();
  });

  it("falls back to memory when the IndexedDB store cannot start", async () => {
    vi.stubGlobal("indexedDB", {});
    const failing = store();
    failing.startup.mockRejectedValue(new Error("quota exceeded"));
    indexedDBStores.mockImplementationOnce(function (this: IndexedDBStore) {
      Object.assign(this, failing);
    });

    const client = await initClient(options, true);

    expect(client.store).toBe(memoryStores.mock.instances[0]);
    expect(client.store.startup).toHaveBeenCalled();
  });

  it("carries on without crypto when it cannot be initialised", async () => {
    clients.mockImplementation((opts) => {
      const client = fakeClient(opts);
      client.initRustCrypto.mockRejectedValue(new Error("stores in use"));
      return client;
    });

    await expect(initClient(options, true)).resolves.toBeDefined();
  });

  it("waits for a sync from the network, past one restored from the store", async () => {
    let client!: FakeClient;
    clients.mockImplementation((opts) => {
      client = fakeClient(opts, false);
      client.store.getSavedSyncToken.mockResolvedValue("saved");
      return client;
    });
    let ready = false;
    const result = initClient(options, true).then(() => (ready = true));
    await flushPromises();

    // The first sync the client reports is the one restored from the store
    client.emit(ClientEvent.Sync, "PREPARED", null);
    await flushPromises();
    expect(ready).toBe(false);

    client.emit(ClientEvent.Sync, "PREPARED", null);
    await result;
    expect(ready).toBe(true);
  });

  it("fails when the first sync does", async () => {
    let client!: FakeClient;
    clients.mockImplementation((opts) => (client = fakeClient(opts, false)));
    const result = initClient(options, true);
    await flushPromises();

    client.emit(ClientEvent.Sync, "ERROR", null, {
      error: new Error("offline"),
    });

    await expect(result).rejects.toThrow("offline");
  });
});

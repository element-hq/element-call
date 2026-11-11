/*
Copyright 2022-2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  ClientEvent,
  createClient,
  type ICreateClientOpts,
  IndexedDBStore,
  type MatrixClient,
  MemoryStore,
} from "matrix-js-sdk";
import { type ISyncStateData, type SyncState } from "matrix-js-sdk/lib/sync";
import { logger } from "matrix-js-sdk/lib/logger";

// This import pulls in many MBs of SDK code and crypto WASM which should only
// be included in full SPA builds, which is why `initClient` gets its own module.
import IndexedDBWorker from "../IndexedDBWorker?worker";
import { getUrlParams } from "../UrlParams";
import { Config } from "../config/Config";
import { fallbackICEServerAllowed } from "./matrix";

const SYNC_STORE_NAME = "element-call-sync";

/**
 * Initialises and returns a new standalone Matrix Client.
 * This can only be called safely if no other client is running
 * otherwise rust crypto will throw since it is not ready to initialize a new session.
 * If another client is running make sure `.logout()` is called before executing this function.
 * @param clientOptions Object of options passed through to the client
 * @param restore If the rust crypto should be reset before the client initialization or
 * if the initialization should try to restore the crypto state from the indexDB.
 * @returns The MatrixClient instance
 */
export async function initClient(
  clientOptions: ICreateClientOpts,
  restore: boolean,
): Promise<MatrixClient> {
  let indexedDB: IDBFactory | undefined;
  try {
    indexedDB = window.indexedDB;
  } catch (e) {
    logger.warn("Could not get indexDB from window.", e);
  }

  // options we always pass to the client (stuff that we need in order to work)
  const baseOpts = {
    fallbackICEServerAllowed: fallbackICEServerAllowed,
    isVoipWithNoMediaAllowed:
      Config.get().features?.feature_group_calls_without_video_and_audio,
  } as ICreateClientOpts;

  if (indexedDB && localStorage) {
    baseOpts.store = new IndexedDBStore({
      indexedDB: window.indexedDB,
      localStorage,
      dbName: SYNC_STORE_NAME,
      // We can't use the worker in dev mode because Vite simply doesn't bundle workers
      // in dev mode: it expects them to use native modules. Ours don't, and even then only
      // Chrome supports it. (It bundles them fine in production mode.)
      workerFactory: import.meta.env.DEV
        ? undefined
        : (): Worker => new IndexedDBWorker(),
    });
  } else if (localStorage) {
    baseOpts.store = new MemoryStore({ localStorage });
  }

  // XXX: we read from the URL params in RoomPage too:
  // it would be much better to read them in one place and pass
  // the values around, but we initialise the matrix client in
  // many different places so we'd have to pass it into all of
  // them.
  const { e2eEnabled } = getUrlParams();
  if (!e2eEnabled) {
    logger.info("Disabling E2E: group call signalling will NOT be encrypted.");
  }

  const client = createClient({
    ...baseOpts,
    ...clientOptions,
    useAuthorizationHeader: true,
    // Use a relatively low timeout for API calls: this is a realtime app
    // so we don't want API calls taking ages, we'd rather they just fail.
    localTimeoutMs: 5000,
    useE2eForGroupCall: e2eEnabled,
    fallbackICEServerAllowed: fallbackICEServerAllowed,
  });

  // In case of logging in a new matrix account but there is still crypto local store. This is needed for:
  // - We lost the auth tokens and cannot restore the client resulting in registering a new user.
  // - We start the sign in flow but are registered with a guest user. (It should additionally log out the guest before)
  // - A new account is created because of missing LocalStorage: "matrix-auth-store", but the crypto IndexDB is still available.
  if (!restore) {
    await client.clearStores();
  }

  // Start client store.
  // Note: The `client.store` is used to store things like sync results. It's independent of
  // the cryptostore, and uses a separate indexeddb database.
  try {
    await client.store.startup();
  } catch (error) {
    logger.error(
      "Error starting matrix client indexDB store. Falling back to memory store.",
      error,
    );
    client.store = new MemoryStore({ localStorage });
    await client.store.startup();
  }

  // Also creates and starts any crypto related stores.
  try {
    await client.initRustCrypto();
  } catch (err) {
    logger.warn(
      err,
      "Make sure to clear client stores before initializing the rust crypto.",
    );
  }

  // Once startClient is called, syncs are run asynchronously.
  // Also, sync completion is communicated only via events.
  // So, apply the event listener *before* starting the client.
  // Otherwise, a sync may complete before the listener gets applied,
  // and we will miss it.
  const syncPromise = waitForSync(client);
  await client.startClient({ clientWellKnownPollPeriod: 60 * 10 });
  await syncPromise;

  return client;
}

async function waitForSync(client: MatrixClient): Promise<void> {
  // If there is a saved sync, the client will fire an additional sync event
  // for restoring it before it runs the first network sync.
  // However, the sync we want to wait for is the network sync,
  // as the saved sync may be missing some state.
  // Thus, don't resolve on the first sync when we know it's for the saved sync.
  let waitForSavedSync = !!(await client.store.getSavedSyncToken());
  return new Promise<void>((resolve, reject) => {
    const onSync = (
      state: SyncState,
      _old: SyncState | null,
      data?: ISyncStateData,
    ): void => {
      if (state === "PREPARED") {
        if (waitForSavedSync) {
          waitForSavedSync = false;
        } else {
          client.removeListener(ClientEvent.Sync, onSync);
          resolve();
        }
      } else if (state === "ERROR") {
        client.removeListener(ClientEvent.Sync, onSync);
        reject(data?.error);
      }
    };
    client.on(ClientEvent.Sync, onSync);
  });
}

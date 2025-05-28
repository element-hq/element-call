/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  ClientEvent,
  calculateRetryBackoff,
  createClient,
  IndexedDBStore,
  MemoryStore,
  Preset,
  Visibility,
} from "matrix-js-sdk";
import { type ISyncStateData, type SyncState } from "matrix-js-sdk/lib/sync";
import { logger } from "matrix-js-sdk/lib/logger";
import { secureRandomBase64Url } from "matrix-js-sdk/lib/randomstring";
import { sleep } from "matrix-js-sdk/lib/utils";

import type { ICreateClientOpts, MatrixClient, Room } from "matrix-js-sdk";
import IndexedDBWorker from "../IndexedDBWorker?worker";
import { generateUrlSearchParams, getUrlParams } from "../UrlParams";
import { Config } from "../config/Config";
import { E2eeType } from "../e2ee/e2eeType";
import {
  type EncryptionSystem,
  saveKeyForRoom,
} from "../e2ee/sharedKeyManagement";

export const fallbackICEServerAllowed =
  import.meta.env.VITE_FALLBACK_STUN_ALLOWED === "true";

const SYNC_STORE_NAME = "element-call-sync";

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

export function roomAliasLocalpartFromRoomName(roomName: string): string {
  return roomName
    .trim()
    .replace(/\s/g, "-")
    .replace(/[^\w-]/g, "")
    .toLowerCase();
}

function fullAliasFromRoomName(roomName: string, client: MatrixClient): string {
  return `#${roomAliasLocalpartFromRoomName(roomName)}:${client.getDomain()}`;
}

/**
 * Applies some basic sanitisation to a room name that the user
 * has given us
 * @param input The room name from the user
 * @param client A matrix client object
 */
export function sanitiseRoomNameInput(input: string): string {
  // check to see if the user has entered a fully qualified room
  // alias. If so, turn it into just the localpart because that's what
  // we use
  const parts = input.split(":", 2);
  if (parts.length === 2 && parts[0][0] === "#") {
    // looks like a room alias
    if (parts[1] === Config.defaultServerName()) {
      // it's local to our own homeserver
      return parts[0];
    } else {
      throw new Error("Unsupported remote room alias");
    }
  }

  // that's all we do here right now
  return input;
}

interface CreateRoomResult {
  roomId: string;
  alias?: string;
  password?: string;
}

/**
 * Create a new room ready for calls
 *
 * @param client Matrix client to use
 * @param name The name of the room
 * @param e2ee The type of e2ee call to create. Note that we would currently never
 *             create a room for per-participant e2ee calls: since it's used in
 *             embedded mode, we use the existing room.
 * @returns Object holding information about the new room
 */
export async function createRoom(
  client: MatrixClient,
  name: string,
  e2ee: E2eeType,
): Promise<CreateRoomResult> {
  logger.log(`Creating room for group call`);
  const createPromise = client.createRoom({
    visibility: Visibility.Private,
    preset: Preset.PublicChat,
    name,
    room_alias_name: e2ee ? undefined : roomAliasLocalpartFromRoomName(name),
    power_level_content_override: {
      invite: 100,
      kick: 100,
      ban: 100,
      redact: 50,
      state_default: 0,
      events_default: 0,
      users_default: 0,
      events: {
        "m.room.power_levels": 100,
        "m.room.history_visibility": 100,
        "m.room.tombstone": 100,
        "m.room.encryption": 100,
        "m.room.name": 50,
        "m.room.message": 0,
        "m.room.encrypted": 50,
        "m.sticker": 50,
        "org.matrix.msc3401.call.member": 0,
      },
      users: {
        [client.getUserId()!]: 100,
      },
    },
  });

  // Wait for the room to arrive
  const roomId = await new Promise<string>((resolve, reject) => {
    createPromise.catch((e) => {
      reject(e);
      cleanUp();
    });

    const onRoom = (room: Room): void => {
      createPromise.then(
        (result) => {
          if (room.roomId === result.room_id) {
            resolve(room.roomId);
            cleanUp();
          }
        },
        (e) => {
          logger.error("Failed to wait for the room to arrive", e);
        },
      );
    };

    const cleanUp = (): void => {
      client.off(ClientEvent.Room, onRoom);
    };
    client.on(ClientEvent.Room, onRoom);
  });

  let password: string | undefined;
  if (e2ee == E2eeType.SHARED_KEY) {
    password = secureRandomBase64Url(16);
    saveKeyForRoom(roomId, password);
  }

  return {
    roomId,
    alias: e2ee ? undefined : fullAliasFromRoomName(name, client),
    password,
  };
}

/**
 * Returns an absolute URL to that will load Element Call with the given room
 * @param roomId ID of the room
 * @param roomName Name of the room
 * @param encryptionSystem what encryption (or EncryptionSystem.Unencrypted) the room uses
 */
export function getAbsoluteRoomUrl(
  roomId: string,
  encryptionSystem: EncryptionSystem,
  roomName?: string,
  viaServers?: string[],
): string {
  return `${window.location.protocol}//${
    window.location.host
  }${getRelativeRoomUrl(roomId, encryptionSystem, roomName, viaServers)}`;
}

/**
 * Returns a relative URL to that will load Element Call with the given room
 * @param roomId ID of the room
 * @param roomName Name of the room
 * @param encryptionSystem what encryption (or EncryptionSystem.Unencrypted) the room uses
 */
export function getRelativeRoomUrl(
  roomId: string,
  encryptionSystem: EncryptionSystem,
  roomName?: string,
  viaServers?: string[],
): string {
  const roomPart = roomName
    ? "/" + roomAliasLocalpartFromRoomName(roomName)
    : "";
  return `/room/#${roomPart}?${generateUrlSearchParams(roomId, encryptionSystem, viaServers).toString()}`;
}

/**
 * Perform a network operation with retries on ConnectionError.
 * If the error is not retryable, or the max number of retries is reached, the error is rethrown.
 * Supports handling of matrix quotas.
 */
export async function doNetworkOperationWithRetry<T>(
  operation: () => Promise<T>,
): Promise<T> {
  let currentRetryCount = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await operation();
    } catch (e) {
      currentRetryCount++;
      const backoff = calculateRetryBackoff(e, currentRetryCount, true);
      if (backoff < 0) {
        // Max number of retries reached, or error is not retryable. rethrow the error
        throw e;
      }
      // wait for the specified time and then retry the request
      await sleep(backoff);
    }
  }
}

/*
Copyright 2022-2023 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { IndexedDBStore } from "matrix-js-sdk/src/store/indexeddb";
import { MemoryStore } from "matrix-js-sdk/src/store/memory";
import {
  createClient,
  ICreateClientOpts,
  Preset,
  Visibility,
} from "matrix-js-sdk/src/matrix";
import { ClientEvent } from "matrix-js-sdk/src/client";
import { ISyncStateData, SyncState } from "matrix-js-sdk/src/sync";
import { logger } from "matrix-js-sdk/src/logger";
import { secureRandomBase64Url } from "matrix-js-sdk/src/randomstring";

import type { MatrixClient } from "matrix-js-sdk/src/client";
import type { Room } from "matrix-js-sdk/src/models/room";
import IndexedDBWorker from "../IndexedDBWorker?worker";
import { generateUrlSearchParams, getUrlParams } from "../UrlParams";
import { Config } from "../config/Config";
import { E2eeType } from "../e2ee/e2eeType";
import { EncryptionSystem, saveKeyForRoom } from "../e2ee/sharedKeyManagement";

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
 * If false is passed for the 'restore' parameter, corresponding crypto
 * data is cleared before the client initialization.
 * @param clientOptions Object of options passed through to the client
 * @param restore Whether the session is being restored from storage
 * @returns The MatrixClient instance
 */
export async function initClient(
  clientOptions: ICreateClientOpts,
  restore: boolean,
): Promise<MatrixClient> {
  let indexedDB: IDBFactory | undefined;
  try {
    indexedDB = window.indexedDB;
  } catch (e) {}

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

  // In case of registering a new matrix account caused by broken store state. This is particularly needed for:
  // - We lost the auth tokens and cannot restore the client resulting in registering a new user.
  // - Need to make sure any possible leftover crypto store gets cleared.
  // - A new account is created because of missing LocalStorage: "matrix-auth-store", but the crypto IndexDB is still available.
  //   This would result in conflicting crypto store userId vs matrixClient userId. Caused by EC 0.6.1
  if (!restore) {
    client.clearStores();
  }

  // Start client store.
  // Note: The `client.store` is used to store things like sync results. It's independent of
  // the cryptostore, and uses a separate indexeddb database.

  // start the client store (totally independent to the crypto store)
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
  await client.initRustCrypto();

  client.setGlobalErrorOnUnknownDevices(false);
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
  await new Promise<void>((resolve, reject) => {
    const onRoom = async (room: Room): Promise<void> => {
      if (room.roomId === (await createPromise).room_id) {
        resolve();
        cleanUp();
      }
    };
    createPromise.catch((e) => {
      reject(e);
      cleanUp();
    });

    const cleanUp = (): void => {
      client.off(ClientEvent.Room, onRoom);
    };
    client.on(ClientEvent.Room, onRoom);
  });

  const result = await createPromise;

  let password;
  if (e2ee == E2eeType.SHARED_KEY) {
    password = secureRandomBase64Url(16);
    saveKeyForRoom(result.room_id, password);
  }

  return {
    roomId: result.room_id,
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

export function getAvatarUrl(
  client: MatrixClient,
  mxcUrl: string,
  avatarSize = 96,
): string {
  const width = Math.floor(avatarSize * window.devicePixelRatio);
  const height = Math.floor(avatarSize * window.devicePixelRatio);
  // scale is more suitable for larger sizes
  const resizeMethod = avatarSize <= 96 ? "crop" : "scale";
  return mxcUrl && client.mxcUrlToHttp(mxcUrl, width, height, resizeMethod)!;
}

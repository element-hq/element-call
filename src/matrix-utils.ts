/*
Copyright 2022 New Vector Ltd

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
import { IndexedDBCryptoStore } from "matrix-js-sdk/src/crypto/store/indexeddb-crypto-store";
import { LocalStorageCryptoStore } from "matrix-js-sdk/src/crypto/store/localStorage-crypto-store";
import { MemoryCryptoStore } from "matrix-js-sdk/src/crypto/store/memory-crypto-store";
import { createClient } from "matrix-js-sdk/src/matrix";
import { ICreateClientOpts } from "matrix-js-sdk/src/matrix";
import { ClientEvent } from "matrix-js-sdk/src/client";
import { Visibility, Preset } from "matrix-js-sdk/src/@types/partials";
import { ISyncStateData, SyncState } from "matrix-js-sdk/src/sync";
import { logger } from "matrix-js-sdk/src/logger";
import {
  GroupCallIntent,
  GroupCallType,
} from "matrix-js-sdk/src/webrtc/groupCall";

import type { MatrixClient } from "matrix-js-sdk/src/client";
import type { Room } from "matrix-js-sdk/src/models/room";
import IndexedDBWorker from "./IndexedDBWorker?worker";
import { getUrlParams } from "./UrlParams";
import { loadOlm } from "./olm";
import { Config } from "./config/Config";

export const fallbackICEServerAllowed =
  import.meta.env.VITE_FALLBACK_STUN_ALLOWED === "true";

export class CryptoStoreIntegrityError extends Error {
  constructor() {
    super("Crypto store data was expected, but none was found");
  }
}

const SYNC_STORE_NAME = "element-call-sync";
// Note that the crypto store name has changed from previous versions
// deliberately in order to force a logout for all users due to
// https://github.com/vector-im/element-call/issues/464
// (It's a good opportunity to make the database names consistent.)
const CRYPTO_STORE_NAME = "element-call-crypto";

function waitForSync(client: MatrixClient) {
  return new Promise<void>((resolve, reject) => {
    const onSync = (
      state: SyncState,
      _old: SyncState,
      data: ISyncStateData
    ) => {
      if (state === "PREPARED") {
        client.removeListener(ClientEvent.Sync, onSync);
        resolve();
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
 * If true is passed for the 'restore' parameter, a check will be made
 * to ensure that corresponding crypto data is stored and recovered.
 * If the check fails, CryptoStoreIntegrityError will be thrown.
 * @param clientOptions Object of options passed through to the client
 * @param restore Whether the session is being restored from storage
 * @returns The MatrixClient instance
 */
export async function initClient(
  clientOptions: ICreateClientOpts,
  restore: boolean
): Promise<MatrixClient> {
  await loadOlm();

  let indexedDB: IDBFactory;
  try {
    indexedDB = window.indexedDB;
  } catch (e) {}

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
        : () => new IndexedDBWorker(),
    });
  } else if (localStorage) {
    baseOpts.store = new MemoryStore({ localStorage });
  }

  // Check whether we have crypto data store. If we are restoring a session
  // from storage then we will have started the crypto store and therefore
  // have generated keys for that device, so if we can't recover those keys,
  // we must not continue or we'll generate new keys and anyone who saw our
  // previous keys will not accept our new key.
  // It's worth mentioning here that if support for indexeddb or localstorage
  // appears or disappears between sessions (it happens) then the failure mode
  // here will be that we'll try a different store, not find crypto data and
  // fail to restore the session. An alternative would be to continue using
  // whatever we were using before, but that could be confusing since you could
  // enable indexeddb and but the app would still not be using it.
  if (restore) {
    if (indexedDB) {
      const cryptoStoreExists = await IndexedDBCryptoStore.exists(
        indexedDB,
        CRYPTO_STORE_NAME
      );
      if (!cryptoStoreExists) throw new CryptoStoreIntegrityError();
    } else if (localStorage) {
      if (!LocalStorageCryptoStore.exists(localStorage))
        throw new CryptoStoreIntegrityError();
    } else {
      // if we get here then we're using the memory store, which cannot
      // possibly have remembered a session, so it's an error.
      throw new CryptoStoreIntegrityError();
    }
  }

  if (indexedDB) {
    baseOpts.cryptoStore = new IndexedDBCryptoStore(
      indexedDB,
      CRYPTO_STORE_NAME
    );
  } else if (localStorage) {
    baseOpts.cryptoStore = new LocalStorageCryptoStore(localStorage);
  } else {
    baseOpts.cryptoStore = new MemoryCryptoStore();
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

  try {
    await client.store.startup();
  } catch (error) {
    console.error(
      "Error starting matrix client store. Falling back to memory store.",
      error
    );
    client.store = new MemoryStore({ localStorage });
    await client.store.startup();
  }

  if (client.initCrypto) {
    await client.initCrypto();
  }

  await client.startClient({
    // dirty hack to reduce chance of gappy syncs
    // should be fixed by spotting gaps and backpaginating
    initialSyncLimit: 50,
  });

  await waitForSync(client);

  return client;
}

export function roomAliasLocalpartFromRoomName(roomName: string): string {
  return roomName
    .trim()
    .replace(/\s/g, "-")
    .replace(/[^\w-]/g, "")
    .toLowerCase();
}

export function fullAliasFromRoomName(
  roomName: string,
  client: MatrixClient
): string {
  return `#${roomAliasLocalpartFromRoomName(roomName)}:${client.getDomain()}`;
}

/**
 * Applies some basic sanitisation to a room name that the user
 * has given us
 * @param input The room name from the user
 * @param client A matrix client object
 */
export function sanitiseRoomNameInput(input: string): string {
  // check to see if the user has enetered a fully qualified room
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

/**
 * XXX: What is this trying to do? It looks like it's getting the localpart from
 * a room alias, but why is it splitting on hyphens and then putting spaces in??
 * @param roomId
 * @returns
 */
export function roomNameFromRoomId(roomId: string): string {
  return roomId
    .match(/([^:]+):.*$/)[1]
    .substring(1)
    .split("-")
    .map((part) =>
      part.length > 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part
    )
    .join(" ")
    .toLowerCase();
}

export function isLocalRoomId(roomId: string, client: MatrixClient): boolean {
  if (!roomId) {
    return false;
  }

  const parts = roomId.match(/[^:]+:(.*)$/);

  if (parts.length < 2) {
    return false;
  }

  return parts[1] === client.getDomain();
}

export async function createRoom(
  client: MatrixClient,
  name: string,
  ptt: boolean
): Promise<[string, string]> {
  logger.log(`Creating room for group call`);
  const createPromise = client.createRoom({
    visibility: Visibility.Private,
    preset: Preset.PublicChat,
    name,
    room_alias_name: roomAliasLocalpartFromRoomName(name),
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
        [client.getUserId()]: 100,
      },
    },
  });

  // Wait for the room to arrive
  await new Promise<void>((resolve, reject) => {
    const onRoom = async (room: Room) => {
      if (room.roomId === (await createPromise).room_id) {
        resolve();
        cleanUp();
      }
    };
    createPromise.catch((e) => {
      reject(e);
      cleanUp();
    });

    const cleanUp = () => {
      client.off(ClientEvent.Room, onRoom);
    };
    client.on(ClientEvent.Room, onRoom);
  });

  const result = await createPromise;

  logger.log(
    `Creating ${ptt ? "PTT" : "video"} group call in ${result.room_id}`
  );

  await client.createGroupCall(
    result.room_id,
    ptt ? GroupCallType.Voice : GroupCallType.Video,
    ptt,
    GroupCallIntent.Room
  );

  return [fullAliasFromRoomName(name, client), result.room_id];
}

// Returns a URL to that will load Element Call with the given room
export function getRoomUrl(roomIdOrAlias: string): string {
  if (roomIdOrAlias.startsWith("#")) {
    const [localPart, host] = roomIdOrAlias.replace("#", "").split(":");

    if (host !== Config.defaultServerName()) {
      return `${window.location.protocol}//${window.location.host}/room/${roomIdOrAlias}`;
    } else {
      return `${window.location.protocol}//${window.location.host}/${localPart}`;
    }
  } else {
    return `${window.location.protocol}//${window.location.host}/room/#?roomId=${roomIdOrAlias}`;
  }
}

export function getAvatarUrl(
  client: MatrixClient,
  mxcUrl: string,
  avatarSize = 96
): string {
  const width = Math.floor(avatarSize * window.devicePixelRatio);
  const height = Math.floor(avatarSize * window.devicePixelRatio);
  // scale is more suitable for larger sizes
  const resizeMethod = avatarSize <= 96 ? "crop" : "scale";
  return mxcUrl && client.mxcUrlToHttp(mxcUrl, width, height, resizeMethod)!;
}

import Olm from "@matrix-org/olm";
import olmWasmPath from "@matrix-org/olm/olm.wasm?url";
import { IndexedDBStore } from "matrix-js-sdk/src/store/indexeddb";
import { MemoryStore } from "matrix-js-sdk/src/store/memory";
import { IndexedDBCryptoStore } from "matrix-js-sdk/src/crypto/store/indexeddb-crypto-store";
import { LocalStorageCryptoStore } from "matrix-js-sdk/src/crypto/store/localStorage-crypto-store";
import { MemoryCryptoStore } from "matrix-js-sdk/src/crypto/store/memory-crypto-store";
import { createClient, MatrixClient } from "matrix-js-sdk/src/matrix";
import { ICreateClientOpts } from "matrix-js-sdk/src/matrix";
import { ClientEvent } from "matrix-js-sdk/src/client";
import { Visibility, Preset } from "matrix-js-sdk/src/@types/partials";
import { ISyncStateData, SyncState } from "matrix-js-sdk/src/sync";
import { logger } from "matrix-js-sdk/src/logger";

import IndexedDBWorker from "./IndexedDBWorker?worker";

export const defaultHomeserver =
  (import.meta.env.VITE_DEFAULT_HOMESERVER as string) ??
  `${window.location.protocol}//${window.location.host}`;

export const defaultHomeserverHost = new URL(defaultHomeserver).host;

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
        resolve();
        client.removeListener(ClientEvent.Sync, onSync);
      } else if (state === "ERROR") {
        reject(data?.error);
        client.removeListener(ClientEvent.Sync, onSync);
      }
    };
    client.on(ClientEvent.Sync, onSync);
  });
}

/**
 * Initialises and returns a new Matrix Client
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
  // TODO: https://gitlab.matrix.org/matrix-org/olm/-/issues/10
  window.OLM_OPTIONS = {};
  await Olm.init({ locateFile: () => olmWasmPath });

  let indexedDB: IDBFactory;

  try {
    indexedDB = window.indexedDB;
  } catch (e) {}

  const storeOpts = {} as ICreateClientOpts;

  if (indexedDB && localStorage && !import.meta.env.DEV) {
    storeOpts.store = new IndexedDBStore({
      indexedDB: window.indexedDB,
      localStorage,
      dbName: SYNC_STORE_NAME,
      workerFactory: () => new IndexedDBWorker(),
    });
  } else if (localStorage) {
    storeOpts.store = new MemoryStore({ localStorage });
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
    storeOpts.cryptoStore = new IndexedDBCryptoStore(
      indexedDB,
      CRYPTO_STORE_NAME
    );
  } else if (localStorage) {
    storeOpts.cryptoStore = new LocalStorageCryptoStore(localStorage);
  } else {
    storeOpts.cryptoStore = new MemoryCryptoStore();
  }

  // XXX: we read from the URL search params in RoomPage too:
  // it would be much better to read them in one place and pass
  // the values around, but we initialise the matrix client in
  // many different places so we'd have to pass it into all of
  // them.
  const params = new URLSearchParams(window.location.search);
  // disable e2e only if enableE2e=false is given
  const enableE2e = params.get("enableE2e") !== "false";

  if (!enableE2e) {
    logger.info("Disabling E2E: group call signalling will NOT be encrypted.");
  }

  const client = createClient({
    ...storeOpts,
    ...clientOptions,
    useAuthorizationHeader: true,
    // Use a relatively low timeout for API calls: this is a realtime application
    // so we don't want API calls taking ages, we'd rather they just fail.
    localTimeoutMs: 5000,
    useE2eForGroupCall: enableE2e,
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

export function isLocalRoomId(roomId: string): boolean {
  if (!roomId) {
    return false;
  }

  const parts = roomId.match(/[^:]+:(.*)$/);

  if (parts.length < 2) {
    return false;
  }

  return parts[1] === defaultHomeserverHost;
}

export async function createRoom(
  client: MatrixClient,
  name: string
): Promise<string> {
  await client.createRoom({
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

  return fullAliasFromRoomName(name, client);
}

export function getRoomUrl(roomId: string): string {
  if (roomId.startsWith("#")) {
    const [localPart, host] = roomId.replace("#", "").split(":");

    if (host !== defaultHomeserverHost) {
      return `${window.location.protocol}//${window.location.host}/room/${roomId}`;
    } else {
      return `${window.location.protocol}//${window.location.host}/${localPart}`;
    }
  } else {
    return `${window.location.protocol}//${window.location.host}/room/${roomId}`;
  }
}

export function getAvatarUrl(
  client: MatrixClient,
  mxcUrl: string,
  avatarSize = 96
): string {
  const width = Math.floor(avatarSize * window.devicePixelRatio);
  const height = Math.floor(avatarSize * window.devicePixelRatio);
  return mxcUrl && client.mxcUrlToHttp(mxcUrl, width, height, "crop");
}

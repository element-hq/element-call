import Olm from "@matrix-org/olm";
import olmWasmPath from "@matrix-org/olm/olm.wasm?url";
import { IndexedDBStore } from "matrix-js-sdk/src/store/indexeddb";
import { WebStorageSessionStore } from "matrix-js-sdk/src/store/session/webstorage";
import { MemoryStore } from "matrix-js-sdk/src/store/memory";
import { IndexedDBCryptoStore } from "matrix-js-sdk/src/crypto/store/indexeddb-crypto-store";
import { createClient, MatrixClient } from "matrix-js-sdk/src/matrix";
import { ICreateClientOpts } from "matrix-js-sdk/src/matrix";
import { ClientEvent } from "matrix-js-sdk/src/client";
import { Visibility, Preset } from "matrix-js-sdk/src/@types/partials";
import {
  GroupCallIntent,
  GroupCallType,
} from "matrix-js-sdk/src/webrtc/groupCall";
import { ISyncStateData, SyncState } from "matrix-js-sdk/src/sync";

import IndexedDBWorker from "./IndexedDBWorker?worker";

export const defaultHomeserver =
  (import.meta.env.VITE_DEFAULT_HOMESERVER as string) ??
  `${window.location.protocol}//${window.location.host}`;

export const defaultHomeserverHost = new URL(defaultHomeserver).host;

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

export async function initClient(
  clientOptions: ICreateClientOpts
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
      localStorage: window.localStorage,
      dbName: "element-call-sync",
      workerFactory: () => new IndexedDBWorker(),
    });
  }

  if (localStorage) {
    storeOpts.sessionStore = new WebStorageSessionStore(localStorage);
  }

  if (indexedDB) {
    storeOpts.cryptoStore = new IndexedDBCryptoStore(
      indexedDB,
      "matrix-js-sdk:crypto"
    );
  }

  const client = createClient({
    ...storeOpts,
    ...clientOptions,
    useAuthorizationHeader: true,
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

export function roomAliasFromRoomName(roomName: string): string {
  return roomName
    .trim()
    .replace(/\s/g, "-")
    .replace(/[^\w-]/g, "")
    .toLowerCase();
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
  name: string,
  isPtt = false
): Promise<string> {
  const createRoomResult = await client.createRoom({
    visibility: Visibility.Private,
    preset: Preset.PublicChat,
    name,
    room_alias_name: roomAliasFromRoomName(name),
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

  console.log({ isPtt });

  await client.createGroupCall(
    createRoomResult.room_id,
    isPtt ? GroupCallType.Voice : GroupCallType.Video,
    isPtt,
    GroupCallIntent.Prompt
  );

  return createRoomResult.room_id;
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

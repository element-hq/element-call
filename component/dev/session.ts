/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  ClientEvent,
  createClient,
  type MatrixClient,
  MemoryStore,
  SyncState,
} from "matrix-js-sdk";

/**
 * Logs in and brings up a client the way a host application would, so that the
 * component is handed a real one rather than something Element Call built for
 * itself.
 *
 * Everything is kept in memory and a fresh login happens on every reload. That
 * costs a device on the development homeserver each time, which is harmless,
 * and buys the harness two clients that cannot tread on each other's storage.
 * Persisting the login to make reloads quicker would mean persisting the
 * crypto store too: reusing a device ID with a fresh crypto store generates new
 * device keys, and uploading them conflicts with the ones the server already
 * holds.
 */
export async function createSession(
  homeserver: string,
  username: string,
  password: string,
  onProgress: (message: string) => void,
): Promise<MatrixClient> {
  onProgress("Logging in");
  const login = await createClient({ baseUrl: homeserver }).login(
    "m.login.password",
    { identifier: { type: "m.id.user", user: username }, password },
  );

  const client = createClient({
    baseUrl: homeserver,
    accessToken: login.access_token,
    userId: login.user_id,
    deviceId: login.device_id,
    store: new MemoryStore(),
    useAuthorizationHeader: true,
    fallbackICEServerAllowed: true,
  });

  onProgress(`Setting up crypto for ${login.device_id}`);
  await client.initRustCrypto({ useIndexedDB: false });

  onProgress(`Syncing ${login.device_id}`);
  await client.startClient();
  await new Promise<void>((resolve) => {
    const onSync = (state: SyncState): void => {
      if (state !== SyncState.Prepared && state !== SyncState.Syncing) return;
      client.off(ClientEvent.Sync, onSync);
      resolve();
    };
    client.on(ClientEvent.Sync, onSync);
  });

  return client;
}

/**
 * The room to call in, joining it if this session is not in it yet — a host
 * hands Element Call a room it already knows about, so the harness has to get
 * itself into that position first.
 */
export async function joinRoom(
  client: MatrixClient,
  roomIdOrAlias: string,
): Promise<string> {
  const room = await client.joinRoom(roomIdOrAlias);
  return room.roomId;
}

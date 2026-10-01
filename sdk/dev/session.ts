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

/** Logs in with a password and returns a client that has finished its first sync. */
export async function createSession(
  homeserver: string,
  username: string,
  password: string,
): Promise<MatrixClient> {
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

  await client.initRustCrypto({ useIndexedDB: false });
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

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
  type Room,
  SyncState,
} from "matrix-js-sdk";
import { KnownMembership } from "matrix-js-sdk/lib/types";

export type Login =
  | { username: string; password: string }
  | { accessToken: string; userId: string; deviceId: string };

/**
 * Returns a client that has finished its first sync, logging in with a
 * password unless the caller already holds a token.
 */
export async function createSession(
  homeserver: string,
  login: Login,
): Promise<MatrixClient> {
  const credentials =
    "accessToken" in login ? login : await logIn(homeserver, login);

  const client = createClient({
    baseUrl: homeserver,
    ...credentials,
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

/**
 * Joins a room and returns it as the sync loop maintains it. The room object
 * `joinRoom` itself returns for a room joined just now is a detached copy
 * that never receives the state the sync delivers, and a session built on
 * it would never see a member.
 */
export async function joinRoom(
  client: MatrixClient,
  roomIdOrAlias: string,
): Promise<Room> {
  const { roomId } = await client.joinRoom(roomIdOrAlias);
  const joinedRoom = (): Room | undefined => {
    const room = client.getRoom(roomId);
    return room?.hasMembershipState(client.getUserId()!, KnownMembership.Join)
      ? room
      : undefined;
  };
  return (
    joinedRoom() ??
    new Promise<Room>((resolve) => {
      const onSync = (): void => {
        const room = joinedRoom();
        if (room === undefined) return;
        client.off(ClientEvent.Sync, onSync);
        resolve(room);
      };
      client.on(ClientEvent.Sync, onSync);
    })
  );
}

async function logIn(
  homeserver: string,
  { username, password }: { username: string; password: string },
): Promise<{ accessToken: string; userId: string; deviceId: string }> {
  const login = await createClient({ baseUrl: homeserver }).login(
    "m.login.password",
    { identifier: { type: "m.id.user", user: username }, password },
  );
  return {
    accessToken: login.access_token,
    userId: login.user_id,
    deviceId: login.device_id,
  };
}

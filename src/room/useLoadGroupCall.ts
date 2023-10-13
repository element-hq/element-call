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

import { useState, useEffect } from "react";
import { logger } from "matrix-js-sdk/src/logger";
import { ClientEvent, MatrixClient } from "matrix-js-sdk/src/client";
import { SyncState } from "matrix-js-sdk/src/sync";
import { useTranslation } from "react-i18next";
import { MatrixRTCSession } from "matrix-js-sdk/src/matrixrtc/MatrixRTCSession";

import type { Room } from "matrix-js-sdk/src/models/room";
import type { GroupCall } from "matrix-js-sdk/src/webrtc/groupCall";

export type GroupCallLoaded = {
  kind: "loaded";
  rtcSession: MatrixRTCSession;
};

export type GroupCallLoadFailed = {
  kind: "failed";
  error: Error;
};

export type GroupCallLoading = {
  kind: "loading";
};

export type GroupCallStatus =
  | GroupCallLoaded
  | GroupCallLoadFailed
  | GroupCallLoading;

export interface GroupCallLoadState {
  error?: Error;
  groupCall?: GroupCall;
}

export const useLoadGroupCall = (
  client: MatrixClient,
  roomIdOrAlias: string,
  viaServers: string[],
): GroupCallStatus => {
  const { t } = useTranslation();
  const [state, setState] = useState<GroupCallStatus>({ kind: "loading" });

  useEffect(() => {
    const fetchOrCreateRoom = async (): Promise<Room> => {
      let room: Room | null = null;
      if (roomIdOrAlias[0] === "#") {
        // We lowercase the localpart when we create the room, so we must lowercase
        // it here too (we just do the whole alias). We can't do the same to room IDs
        // though.
        // Also, we explicitly look up the room alias here. We previously just tried to
        // join anyway but the js-sdk recreates the room if you pass the alias for a
        // room you're already joined to (which it probably ought not to).
        const lookupResult = await client.getRoomIdForAlias(
          roomIdOrAlias.toLowerCase(),
        );
        logger.info(`${roomIdOrAlias} resolved to ${lookupResult.room_id}`);
        room = client.getRoom(lookupResult.room_id);
        if (!room) {
          logger.info(`Room ${lookupResult.room_id} not found, joining.`);
          room = await client.joinRoom(lookupResult.room_id, {
            viaServers: lookupResult.servers,
          });
        } else {
          logger.info(
            `Already in room ${lookupResult.room_id}, not rejoining.`,
          );
        }
      } else {
        // room IDs we just try to join by their ID, which will not work in the
        // general case without providing some servers to join via. We could provide
        // our own server, but in practice that is implicit.
        room = await client.joinRoom(roomIdOrAlias);
      }

      logger.info(
        `Joined ${roomIdOrAlias}, waiting room to be ready for group calls`,
      );
      await client.waitUntilRoomReadyForGroupCalls(room.roomId);
      logger.info(`${roomIdOrAlias}, is ready for group calls`);
      return room;
    };

    const fetchOrCreateGroupCall = async (): Promise<MatrixRTCSession> => {
      const room = await fetchOrCreateRoom();
      logger.debug(`Fetched / joined room ${roomIdOrAlias}`);

      const rtcSession = client.matrixRTC.getRoomSession(room);
      return rtcSession;
    };

    const waitForClientSyncing = async (): Promise<void> => {
      if (client.getSyncState() !== SyncState.Syncing) {
        logger.debug(
          "useLoadGroupCall: waiting for client to start syncing...",
        );
        await new Promise<void>((resolve) => {
          const onSync = (): void => {
            if (client.getSyncState() === SyncState.Syncing) {
              client.off(ClientEvent.Sync, onSync);
              return resolve();
            }
          };
          client.on(ClientEvent.Sync, onSync);
        });
        logger.debug("useLoadGroupCall: client is now syncing.");
      }
    };

    waitForClientSyncing()
      .then(fetchOrCreateGroupCall)
      .then((rtcSession) => setState({ kind: "loaded", rtcSession }))
      .catch((error) => setState({ kind: "failed", error }));
  }, [client, roomIdOrAlias, viaServers, t]);

  return state;
};

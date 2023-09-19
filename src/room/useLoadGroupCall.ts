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
import { useEnableE2EE } from "../settings/useSetting";

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
  viaServers: string[]
): GroupCallStatus => {
  const { t } = useTranslation();
  const [state, setState] = useState<GroupCallStatus>({ kind: "loading" });

  const [e2eeEnabled] = useEnableE2EE();

  useEffect(() => {
    const fetchOrCreateRoom = async (): Promise<Room> => {
      // We lowercase the localpart when we create the room, so we must lowercase
      // it here too (we just do the whole alias). We can't do the same to room IDs
      // though.
      const sanitisedIdOrAlias =
        roomIdOrAlias[0] === "#" ? roomIdOrAlias.toLowerCase() : roomIdOrAlias;

      const room = await client.joinRoom(sanitisedIdOrAlias, {
        viaServers,
      });
      logger.info(
        `Joined ${sanitisedIdOrAlias}, waiting room to be ready for group calls`
      );
      await client.waitUntilRoomReadyForGroupCalls(room.roomId);
      logger.info(`${sanitisedIdOrAlias}, is ready for group calls`);
      return room;
    };

    const fetchOrCreateGroupCall = async (): Promise<MatrixRTCSession> => {
      const room = await fetchOrCreateRoom();
      logger.debug(`Fetched / joined room ${roomIdOrAlias}`);

      const rtcSession = client.matrixRTC.getRoomSession(room);
      return rtcSession;
    };

    const waitForClientSyncing = async () => {
      if (client.getSyncState() !== SyncState.Syncing) {
        logger.debug(
          "useLoadGroupCall: waiting for client to start syncing..."
        );
        await new Promise<void>((resolve) => {
          const onSync = () => {
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
  }, [client, roomIdOrAlias, viaServers, t, e2eeEnabled]);

  return state;
};

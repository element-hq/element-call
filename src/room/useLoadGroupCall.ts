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
import { EventType } from "matrix-js-sdk/src/@types/event";
import {
  GroupCallType,
  GroupCallIntent,
} from "matrix-js-sdk/src/webrtc/groupCall";
import { GroupCallEventHandlerEvent } from "matrix-js-sdk/src/webrtc/groupCallEventHandler";
import { logger } from "matrix-js-sdk/src/logger";
import { ClientEvent, MatrixClient } from "matrix-js-sdk/src/client";
import { SyncState } from "matrix-js-sdk/src/sync";
import { useTranslation } from "react-i18next";

import type { Room } from "matrix-js-sdk/src/models/room";
import type { GroupCall } from "matrix-js-sdk/src/webrtc/groupCall";
import { isLocalRoomId, createRoom, roomNameFromRoomId } from "../matrix-utils";
import { translatedError } from "../TranslatedError";
import { widget } from "../widget";

const STATS_COLLECT_INTERVAL_TIME_MS = 10000;

export interface GroupCallLoadState {
  loading: boolean;
  error?: Error;
  groupCall?: GroupCall;
}

export const useLoadGroupCall = (
  client: MatrixClient,
  roomIdOrAlias: string,
  viaServers: string[],
  createPtt: boolean
): GroupCallLoadState => {
  const { t } = useTranslation();
  const [state, setState] = useState<GroupCallLoadState>({ loading: true });

  useEffect(() => {
    setState({ loading: true });

    const fetchOrCreateRoom = async (): Promise<Room> => {
      try {
        // We lowercase the localpart when we create the room, so we must lowercase
        // it here too (we just do the whole alias). We can't do the same to room IDs
        // though.
        const sanitisedIdOrAlias =
          roomIdOrAlias[0] === "#"
            ? roomIdOrAlias.toLowerCase()
            : roomIdOrAlias;

        const room = await client.joinRoom(sanitisedIdOrAlias, {
          viaServers,
        });
        logger.info(
          `Joined ${sanitisedIdOrAlias}, waiting room to be ready for group calls`
        );
        await client.waitUntilRoomReadyForGroupCalls(room.roomId);
        logger.info(`${sanitisedIdOrAlias}, is ready for group calls`);
        return room;
      } catch (error) {
        if (
          isLocalRoomId(roomIdOrAlias, client) &&
          (error.errcode === "M_NOT_FOUND" ||
            (error.message &&
              error.message.indexOf("Failed to fetch alias") !== -1))
        ) {
          // The room doesn't exist, but we can create it
          const [, roomId] = await createRoom(
            client,
            roomNameFromRoomId(roomIdOrAlias),
            createPtt
          );
          // likewise, wait for the room
          await client.waitUntilRoomReadyForGroupCalls(roomId);
          return client.getRoom(roomId);
        } else {
          throw error;
        }
      }
    };

    const fetchOrCreateGroupCall = async (): Promise<GroupCall> => {
      const room = await fetchOrCreateRoom();
      logger.debug(`Fetched / joined room ${roomIdOrAlias}`);
      let groupCall = client.getGroupCallForRoom(room.roomId);
      logger.debug("Got group call", groupCall?.groupCallId);

      if (groupCall) {
        groupCall.setGroupCallStatsInterval(STATS_COLLECT_INTERVAL_TIME_MS);
        return groupCall;
      }

      if (
        !widget &&
        room.currentState.mayClientSendStateEvent(
          EventType.GroupCallPrefix,
          client
        )
      ) {
        // The call doesn't exist, but we can create it
        console.log(
          `No call found in ${roomIdOrAlias}: creating ${
            createPtt ? "PTT" : "video"
          } call`
        );
        groupCall = await client.createGroupCall(
          room.roomId,
          createPtt ? GroupCallType.Voice : GroupCallType.Video,
          createPtt,
          GroupCallIntent.Room
        );
        groupCall.setGroupCallStatsInterval(STATS_COLLECT_INTERVAL_TIME_MS);
        return groupCall;
      }

      // We don't have permission to create the call, so all we can do is wait
      // for one to come in
      return new Promise((resolve, reject) => {
        const onGroupCallIncoming = (groupCall: GroupCall) => {
          if (groupCall?.room.roomId === room.roomId) {
            clearTimeout(timeout);
            groupCall.setGroupCallStatsInterval(STATS_COLLECT_INTERVAL_TIME_MS);
            client.off(
              GroupCallEventHandlerEvent.Incoming,
              onGroupCallIncoming
            );
            resolve(groupCall);
          }
        };
        client.on(GroupCallEventHandlerEvent.Incoming, onGroupCallIncoming);

        const timeout = setTimeout(() => {
          client.off(GroupCallEventHandlerEvent.Incoming, onGroupCallIncoming);
          reject(translatedError("Fetching group call timed out.", t));
        }, 30000);
      });
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
      .then((groupCall) =>
        setState((prevState) => ({ ...prevState, loading: false, groupCall }))
      )
      .catch((error) =>
        setState((prevState) => ({ ...prevState, loading: false, error }))
      );
  }, [client, roomIdOrAlias, viaServers, createPtt, t]);

  return state;
};

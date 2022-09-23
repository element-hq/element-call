/*
Copyright 2022 Matrix.org Foundation C.I.C.

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

import type { Room } from "matrix-js-sdk/src/models/room";
import type { GroupCall } from "matrix-js-sdk/src/webrtc/groupCall";
import { isLocalRoomId, createRoom, roomNameFromRoomId } from "../matrix-utils";

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
  const [state, setState] = useState<GroupCallLoadState>({ loading: true });

  useEffect(() => {
    setState({ loading: true });

    const fetchOrCreateRoom = async (): Promise<Room> => {
      try {
        const room = await client.joinRoom(roomIdOrAlias, { viaServers });
        logger.info(
          `Joined ${roomIdOrAlias}, waiting room to be ready for group calls`
        );
        await client.waitUntilRoomReadyForGroupCalls(room.roomId);
        logger.info(`${roomIdOrAlias}, is ready for group calls`);
        return room;
      } catch (error) {
        if (
          isLocalRoomId(roomIdOrAlias) &&
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
      const groupCall = client.getGroupCallForRoom(room.roomId);
      logger.debug("Got group call", groupCall?.groupCallId);

      if (groupCall) return groupCall;

      if (
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
        return await client.createGroupCall(
          room.roomId,
          createPtt ? GroupCallType.Voice : GroupCallType.Video,
          createPtt,
          GroupCallIntent.Room
        );
      }

      // We don't have permission to create the call, so all we can do is wait
      // for one to come in
      return new Promise((resolve, reject) => {
        const onGroupCallIncoming = (groupCall: GroupCall) => {
          if (groupCall?.room.roomId === room.roomId) {
            clearTimeout(timeout);
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
          reject(new Error("Fetching group call timed out."));
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
  }, [client, roomIdOrAlias, viaServers, createPtt]);

  return state;
};

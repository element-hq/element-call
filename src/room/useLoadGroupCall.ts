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

import type { MatrixClient } from "matrix-js-sdk/src/client";
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
        return await client.joinRoom(roomIdOrAlias, { viaServers });
      } catch (error) {
        if (
          isLocalRoomId(roomIdOrAlias) &&
          (error.errcode === "M_NOT_FOUND" ||
            (error.message &&
              error.message.indexOf("Failed to fetch alias") !== -1))
        ) {
          // The room doesn't exist, but we can create it
          await createRoom(client, roomNameFromRoomId(roomIdOrAlias));
          return await client.joinRoom(roomIdOrAlias, { viaServers });
        } else {
          throw error;
        }
      }
    };

    const fetchOrCreateGroupCall = async (): Promise<GroupCall> => {
      const room = await fetchOrCreateRoom();
      const groupCall = client.getGroupCallForRoom(room.roomId);

      if (groupCall) {
        return groupCall;
      } else if (
        room.currentState.mayClientSendStateEvent(
          EventType.GroupCallPrefix,
          client
        )
      ) {
        // The call doesn't exist, but we can create it
        console.log(`Creating ${createPtt ? "PTT" : "video"} group call room`);
        return await client.createGroupCall(
          room.roomId,
          createPtt ? GroupCallType.Voice : GroupCallType.Video,
          createPtt,
          GroupCallIntent.Room
        );
      } else {
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
            client.off(
              GroupCallEventHandlerEvent.Incoming,
              onGroupCallIncoming
            );
            reject(new Error("Fetching group call timed out."));
          }, 30000);
        });
      }
    };

    fetchOrCreateGroupCall()
      .then((groupCall) =>
        setState((prevState) => ({ ...prevState, loading: false, groupCall }))
      )
      .catch((error) =>
        setState((prevState) => ({ ...prevState, loading: false, error }))
      );
  }, [client, roomIdOrAlias, viaServers, createPtt]);

  return state;
};

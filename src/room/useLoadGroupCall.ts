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
import { GroupCall } from "matrix-js-sdk/src/webrtc/groupCall";
import { MatrixClient } from "matrix-js-sdk";
import { useState, useEffect } from "react";
import { GroupCallEventHandlerEvent } from "matrix-js-sdk/src/webrtc/groupCallEventHandler";

import { isLocalRoomId, createRoom, roomNameFromRoomId } from "../matrix-utils";

async function fetchGroupCall(
  client: MatrixClient,
  roomIdOrAlias: string,
  viaServers: string[] = undefined,
  timeout = 5000
) {
  const { roomId }: { roomId: string } = await client.joinRoom(roomIdOrAlias, {
    viaServers,
  });

  return new Promise<GroupCall>((resolve, reject) => {
    let timeoutId: number;

    function onGroupCallIncoming(groupCall: GroupCall) {
      if (groupCall && groupCall.room.roomId === roomId) {
        clearTimeout(timeoutId);
        client.removeListener(
          GroupCallEventHandlerEvent.Incoming,
          onGroupCallIncoming
        );
        resolve(groupCall);
      }
    }

    const groupCall: GroupCall = client.getGroupCallForRoom(roomId);

    if (groupCall) {
      resolve(groupCall);
    }

    client.on(GroupCallEventHandlerEvent.Incoming, onGroupCallIncoming);

    if (timeout) {
      timeoutId = setTimeout(() => {
        client.removeListener(
          GroupCallEventHandlerEvent.Incoming,
          onGroupCallIncoming
        );
        reject(new Error("Fetching group call timed out."));
      }, timeout);
    }
  });
}
interface State {
  loading: boolean;
  error?: Error;
  groupCall?: GroupCall;
}
export function useLoadGroupCall(
  client: MatrixClient,
  roomId: string,
  viaServers: string[],
  createIfNotFound: boolean
) {
  const [state, setState] = useState<State>({
    loading: true,
    error: undefined,
    groupCall: undefined,
  });

  useEffect(() => {
    async function fetchOrCreateGroupCall() {
      try {
        const groupCall = await fetchGroupCall(
          client,
          roomId,
          viaServers,
          30000
        );
        return groupCall;
      } catch (error) {
        if (
          createIfNotFound &&
          (error.errcode === "M_NOT_FOUND" ||
            (error.message &&
              error.message.indexOf("Failed to fetch alias") !== -1)) &&
          isLocalRoomId(roomId)
        ) {
          const roomName = roomNameFromRoomId(roomId);
          await createRoom(client, roomName);
          const groupCall = await fetchGroupCall(
            client,
            roomId,
            viaServers,
            30000
          );
          return groupCall;
        }

        throw error;
      }
    }

    setState({ loading: true });

    fetchOrCreateGroupCall()
      .then((groupCall) =>
        setState((prevState) => ({ ...prevState, loading: false, groupCall }))
      )
      .catch((error) =>
        setState((prevState) => ({ ...prevState, loading: false, error }))
      );
  }, [client, roomId, createIfNotFound, viaServers]);

  return state;
}

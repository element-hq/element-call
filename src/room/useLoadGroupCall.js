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
import { isLocalRoomId, createRoom, roomNameFromRoomId } from "../matrix-utils";

async function fetchGroupCall(
  client,
  roomIdOrAlias,
  viaServers = undefined,
  timeout = 5000
) {
  const { roomId } = await client.joinRoom(roomIdOrAlias, { viaServers });

  return new Promise((resolve, reject) => {
    let timeoutId;

    function onGroupCallIncoming(groupCall) {
      if (groupCall && groupCall.room.roomId === roomId) {
        clearTimeout(timeoutId);
        client.removeListener("GroupCall.incoming", onGroupCallIncoming);
        resolve(groupCall);
      }
    }

    const groupCall = client.getGroupCallForRoom(roomId);

    if (groupCall) {
      resolve(groupCall);
    }

    client.on("GroupCall.incoming", onGroupCallIncoming);

    if (timeout) {
      timeoutId = setTimeout(() => {
        client.removeListener("GroupCall.incoming", onGroupCallIncoming);
        reject(new Error("Fetching group call timed out."));
      }, timeout);
    }
  });
}

export function useLoadGroupCall(client, roomId, viaServers, createIfNotFound) {
  const [state, setState] = useState({
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
  }, [client, roomId, state.reloadId]);

  return state;
}

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
  }, [client, roomId, state.reloadId, createIfNotFound, viaServers]);

  return state;
}

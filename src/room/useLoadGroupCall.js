import { useState, useEffect, useCallback } from "react";

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

export function useLoadGroupCall(client, roomId, viaServers) {
  const [state, setState] = useState({
    loading: true,
    error: undefined,
    groupCall: undefined,
    reloadId: 0,
  });

  useEffect(() => {
    setState({ loading: true });
    fetchGroupCall(client, roomId, viaServers, 30000)
      .then((groupCall) =>
        setState((prevState) => ({ ...prevState, loading: false, groupCall }))
      )
      .catch((error) =>
        setState((prevState) => ({ ...prevState, loading: false, error }))
      );
  }, [client, roomId, state.reloadId]);

  const reload = useCallback(() => {
    setState((prevState) => ({ ...prevState, reloadId: prevState.reloadId++ }));
  }, []);

  return { ...state, reload };
}

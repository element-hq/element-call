/*
Copyright 2021 New Vector Ltd

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

import { useCallback, useEffect, useState } from "react";
import matrix from "matrix-js-sdk/src/browser-index";

function waitForSync(client) {
  return new Promise((resolve, reject) => {
    const onSync = (state, _old, data) => {
      if (state === "PREPARED") {
        resolve();
        client.removeListener("sync", onSync);
      } else if (state === "ERROR") {
        reject(data?.error);
        client.removeListener("sync", onSync);
      }
    };
    client.on("sync", onSync);
  });
}

async function initClient(clientOptions, guest) {
  const client = matrix.createClient(clientOptions);

  if (guest) {
    client.setGuest(true);
  }

  await client.startClient({
    // dirty hack to reduce chance of gappy syncs
    // should be fixed by spotting gaps and backpaginating
    initialSyncLimit: 50,
  });

  await waitForSync(client);

  return client;
}

export async function fetchGroupCall(
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

export function useClient(homeserverUrl) {
  const [{ loading, authenticated, client }, setState] = useState({
    loading: true,
    authenticated: false,
    client: undefined,
  });

  useEffect(() => {
    async function restore() {
      try {
        const authStore = localStorage.getItem("matrix-auth-store");

        if (authStore) {
          const { user_id, device_id, access_token, guest } =
            JSON.parse(authStore);

          const client = await initClient(
            {
              baseUrl: homeserverUrl,
              accessToken: access_token,
              userId: user_id,
              deviceId: device_id,
            },
            guest
          );

          localStorage.setItem(
            "matrix-auth-store",
            JSON.stringify({ user_id, device_id, access_token, guest })
          );

          return client;
        }
      } catch (err) {
        localStorage.removeItem("matrix-auth-store");
        throw err;
      }
    }

    restore()
      .then((client) => {
        if (client) {
          setState({ client, loading: false, authenticated: true });
        } else {
          setState({ client: undefined, loading: false, authenticated: false });
        }
      })
      .catch(() => {
        setState({ client: undefined, loading: false, authenticated: false });
      });
  }, []);

  const login = useCallback(async (homeserver, username, password) => {
    try {
      let loginHomeserverUrl = homeserver.trim();

      if (!loginHomeserverUrl.includes("://")) {
        loginHomeserverUrl = "https://" + loginHomeserverUrl;
      }

      try {
        const wellKnownUrl = new URL(
          "/.well-known/matrix/client",
          window.location
        );
        const response = await fetch(wellKnownUrl);
        const config = await response.json();

        if (config["m.homeserver"]) {
          loginHomeserverUrl = config["m.homeserver"];
        }
      } catch (error) {}

      const registrationClient = matrix.createClient(loginHomeserverUrl);

      const { user_id, device_id, access_token } =
        await registrationClient.loginWithPassword(username, password);

      const client = await initClient({
        baseUrl: loginHomeserverUrl,
        accessToken: access_token,
        userId: user_id,
        deviceId: device_id,
      });

      localStorage.setItem(
        "matrix-auth-store",
        JSON.stringify({ user_id, device_id, access_token })
      );

      setState({ client, loading: false, authenticated: true });
    } catch (err) {
      localStorage.removeItem("matrix-auth-store");
      setState({ client: undefined, loading: false, authenticated: false });
      throw err;
    }
  }, []);

  const registerGuest = useCallback(async () => {
    try {
      const registrationClient = matrix.createClient(homeserverUrl);

      const { user_id, device_id, access_token } =
        await registrationClient.registerGuest({});

      const client = await initClient(
        {
          baseUrl: homeserverUrl,
          accessToken: access_token,
          userId: user_id,
          deviceId: device_id,
        },
        true
      );

      await client.setProfileInfo("displayname", {
        displayname: `Guest ${client.getUserIdLocalpart()}`,
      });

      localStorage.setItem(
        "matrix-auth-store",
        JSON.stringify({ user_id, device_id, access_token, guest: true })
      );

      setState({ client, loading: false, authenticated: true });
    } catch (err) {
      localStorage.removeItem("matrix-auth-store");
      setState({ client: undefined, loading: false, authenticated: false });
      throw err;
    }
  }, []);

  const register = useCallback(async (username, password) => {
    try {
      const registrationClient = matrix.createClient(homeserverUrl);

      const { user_id, device_id, access_token } =
        await registrationClient.register(username, password, null, {
          type: "m.login.dummy",
        });

      const client = await initClient({
        baseUrl: homeserverUrl,
        accessToken: access_token,
        userId: user_id,
        deviceId: device_id,
      });

      localStorage.setItem(
        "matrix-auth-store",
        JSON.stringify({ user_id, device_id, access_token })
      );

      setState({ client, loading: false, authenticated: true });
    } catch (err) {
      localStorage.removeItem("matrix-auth-store");
      setState({ client: undefined, loading: false, authenticated: false });
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("matrix-auth-store");
    setState({ client: undefined, loading: false, authenticated: false });
  }, []);

  return {
    loading,
    authenticated,
    client,
    login,
    registerGuest,
    register,
    logout,
  };
}

const tsCache = {};

function getLastTs(client, r) {
  if (tsCache[r.roomId]) {
    return tsCache[r.roomId];
  }

  if (!r || !r.timeline) {
    const ts = Number.MAX_SAFE_INTEGER;
    tsCache[r.roomId] = ts;
    return ts;
  }

  const myUserId = client.getUserId();

  if (r.getMyMembership() !== "join") {
    const membershipEvent = r.currentState.getStateEvents(
      "m.room.member",
      myUserId
    );

    if (membershipEvent && !Array.isArray(membershipEvent)) {
      const ts = membershipEvent.getTs();
      tsCache[r.roomId] = ts;
      return ts;
    }
  }

  for (let i = r.timeline.length - 1; i >= 0; --i) {
    const ev = r.timeline[i];
    const ts = ev.getTs();

    if (ts) {
      tsCache[r.roomId] = ts;
      return ts;
    }
  }

  const ts = Number.MAX_SAFE_INTEGER;
  tsCache[r.roomId] = ts;
  return ts;
}

function sortRooms(client, rooms) {
  return rooms.sort((a, b) => {
    return getLastTs(client, b) - getLastTs(client, a);
  });
}

export function useGroupCallRooms(client) {
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    function updateRooms() {
      const groupCalls = client.groupCallEventHandler.groupCalls.values();
      const rooms = Array.from(groupCalls).map((groupCall) => groupCall.room);
      const sortedRooms = sortRooms(client, rooms);
      const items = sortedRooms.map((room) => {
        const groupCall = client.getGroupCallForRoom(room.roomId);

        return {
          room,
          groupCall,
          participants: [...groupCall.participants],
        };
      });
      setRooms(items);
    }

    updateRooms();

    client.on("GroupCall.incoming", updateRooms);
    client.on("GroupCall.participants", updateRooms);

    return () => {
      client.removeListener("GroupCall.incoming", updateRooms);
      client.removeListener("GroupCall.participants", updateRooms);
    };
  }, []);

  return rooms;
}

export function usePublicRooms(client, publicSpaceRoomId, maxRooms = 50) {
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    if (publicSpaceRoomId) {
      client.getRoomHierarchy(publicSpaceRoomId, maxRooms).then(({ rooms }) => {
        const filteredRooms = rooms.filter(
          (room) => room.room_type !== "m.space"
        );

        setRooms(filteredRooms);
      });
    } else {
      setRooms([]);
    }
  }, [publicSpaceRoomId]);

  return rooms;
}

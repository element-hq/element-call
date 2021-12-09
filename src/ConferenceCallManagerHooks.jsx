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

import React, {
  useCallback,
  useEffect,
  useState,
  createContext,
  useMemo,
  useContext,
} from "react";
import matrix from "matrix-js-sdk/src/browser-index";
import {
  GroupCallIntent,
  GroupCallType,
} from "matrix-js-sdk/src/browser-index";
import { useHistory } from "react-router-dom";
import { randomString } from "matrix-js-sdk/src/randomstring";

const ClientContext = createContext();

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

export function ClientProvider({ homeserverUrl, children }) {
  const history = useHistory();
  const [{ loading, isAuthenticated, isGuest, client, userName }, setState] =
    useState({
      loading: true,
      isAuthenticated: false,
      isGuest: false,
      client: undefined,
      userName: null,
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

          return { client, guest };
        }

        return { client: undefined, guest: false };
      } catch (err) {
        localStorage.removeItem("matrix-auth-store");
        throw err;
      }
    }

    restore()
      .then(({ client, guest }) => {
        setState({
          client,
          loading: false,
          isAuthenticated: !!client,
          isGuest: guest,
          userName: client?.getUserIdLocalpart(),
        });
      })
      .catch(() => {
        setState({
          client: undefined,
          loading: false,
          isAuthenticated: false,
          isGuest: false,
          userName: null,
        });
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

      setState({
        client,
        loading: false,
        isAuthenticated: true,
        isGuest: false,
        userName: client.getUserIdLocalpart(),
      });
    } catch (err) {
      localStorage.removeItem("matrix-auth-store");
      setState({
        client: undefined,
        loading: false,
        isAuthenticated: false,
        isGuest: false,
        userName: null,
      });
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

      setState({
        client,
        loading: false,
        isAuthenticated: true,
        isGuest: true,
        userName: client.getUserIdLocalpart(),
      });
    } catch (err) {
      localStorage.removeItem("matrix-auth-store");
      setState({
        client: undefined,
        loading: false,
        isAuthenticated: false,
        isGuest: false,
        userName: null,
      });
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

      setState({
        client,
        loading: false,
        isGuest: false,
        isAuthenticated: true,
        isGuest: false,
        userName: client.getUserIdLocalpart(),
      });

      return client;
    } catch (err) {
      localStorage.removeItem("matrix-auth-store");
      setState({
        client: undefined,
        loading: false,
        isGuest: false,
        isAuthenticated: false,
        userName: null,
      });
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("matrix-auth-store");
    window.location = "/";
  }, [history]);

  const context = useMemo(
    () => ({
      loading,
      isAuthenticated,
      isGuest,
      client,
      login,
      registerGuest,
      register,
      logout,
      userName,
    }),
    [
      loading,
      isAuthenticated,
      isGuest,
      client,
      login,
      registerGuest,
      register,
      logout,
      userName,
    ]
  );

  return (
    <ClientContext.Provider value={context}>{children}</ClientContext.Provider>
  );
}

export function useClient() {
  return useContext(ClientContext);
}

function roomAliasFromRoomName(roomName) {
  return roomName
    .trim()
    .replace(/\s/g, "-")
    .replace(/[^\w-]/g, "")
    .toLowerCase();
}

export async function createRoom(client, name) {
  const { room_id, room_alias } = await client.createRoom({
    visibility: "private",
    preset: "public_chat",
    name,
    room_alias_name: roomAliasFromRoomName(name),
    power_level_content_override: {
      invite: 100,
      kick: 100,
      ban: 100,
      redact: 50,
      state_default: 0,
      events_default: 0,
      users_default: 0,
      events: {
        "m.room.power_levels": 100,
        "m.room.history_visibility": 100,
        "m.room.tombstone": 100,
        "m.room.encryption": 100,
        "m.room.name": 50,
        "m.room.message": 0,
        "m.room.encrypted": 50,
        "m.sticker": 50,
        "org.matrix.msc3401.call.member": 0,
      },
      users: {
        [client.getUserId()]: 100,
      },
    },
  });

  await client.setGuestAccess(room_id, {
    allowJoin: true,
    allowRead: true,
  });

  await client.createGroupCall(
    room_id,
    GroupCallType.Video,
    GroupCallIntent.Prompt
  );

  return room_alias || room_id;
}

export function useCreateRoom(client) {
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [createRoomError, setCreateRoomError] = useState();

  const onCreateRoom = useCallback(
    (roomName) => {
      setCreateRoomError(undefined);
      setCreatingRoom(true);

      return createRoom(client, roomName).catch((error) => {
        setCreateRoomError(error);
        setCreatingRoom(false);
      });
    },
    [client]
  );

  return {
    creatingRoom,
    createRoomError,
    createRoom: onCreateRoom,
  };
}

export function useCreateRoomAsPasswordlessUser() {
  const { register } = useClient();
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [createRoomError, setCreateRoomError] = useState();

  const onCreateRoom = useCallback(
    (roomName, userName) => {
      async function onCreateRoom(roomName, userName) {
        const client = await register(userName, randomString(16));
        return await createRoom(client, roomName);
      }

      setCreateRoomError(undefined);
      setCreatingRoom(true);

      return onCreateRoom(roomName, userName).catch((error) => {
        setCreateRoomError(error);
        setCreatingRoom(false);
      });
    },
    [register]
  );

  return {
    creatingRoom,
    createRoomError,
    createRoom: onCreateRoom,
  };
}

export function useLoadGroupCall(client, roomId, viaServers) {
  const [state, setState] = useState({
    loading: true,
    error: undefined,
    groupCall: undefined,
  });

  useEffect(() => {
    setState({ loading: true });
    fetchGroupCall(client, roomId, viaServers, 30000)
      .then((groupCall) => setState({ loading: false, groupCall }))
      .catch((error) => setState({ loading: false, error }));
  }, [client, roomId]);

  return state;
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
          roomId: room.roomId,
          roomName: room.name,
          avatarUrl: null,
          roomUrl: `/room/${room.getCanonicalAlias() || room.roomId}`,
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
        const filteredRooms = rooms
          .filter((room) => room.room_type !== "m.space")
          .map((room) => ({
            roomId: room.room_id,
            roomName: room.name,
            avatarUrl: null,
            room,
            roomUrl: `/room/${room.room_id}`,
            participants: [],
          }));

        setRooms(filteredRooms);
      });
    } else {
      setRooms([]);
    }
  }, [publicSpaceRoomId]);

  return rooms;
}

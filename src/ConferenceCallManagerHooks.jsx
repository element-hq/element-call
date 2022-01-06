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

export const defaultHomeserver =
  import.meta.env.VITE_DEFAULT_HOMESERVER ||
  `${window.location.protocol}//${window.location.host}`;

export const defaultHomeserverHost = new URL(defaultHomeserver).host;

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

export async function initClient(clientOptions) {
  const client = matrix.createClient(clientOptions);

  await client.startClient({
    // dirty hack to reduce chance of gappy syncs
    // should be fixed by spotting gaps and backpaginating
    initialSyncLimit: 50,
  });

  await waitForSync(client);

  return client;
}

export function ClientProvider({ children }) {
  const history = useHistory();
  const [
    { loading, isAuthenticated, isPasswordlessUser, client, userName },
    setState,
  ] = useState({
    loading: true,
    isAuthenticated: false,
    isPasswordlessUser: false,
    client: undefined,
    userName: null,
  });

  useEffect(() => {
    async function restore() {
      try {
        const authStore = localStorage.getItem("matrix-auth-store");

        if (authStore) {
          const {
            user_id,
            device_id,
            access_token,
            passwordlessUser,
            tempPassword,
          } = JSON.parse(authStore);

          const client = await initClient({
            baseUrl: defaultHomeserver,
            accessToken: access_token,
            userId: user_id,
            deviceId: device_id,
          });

          localStorage.setItem(
            "matrix-auth-store",
            JSON.stringify({
              user_id,
              device_id,
              access_token,

              passwordlessUser,
              tempPassword,
            })
          );

          return { client, passwordlessUser };
        }

        return { client: undefined };
      } catch (err) {
        localStorage.removeItem("matrix-auth-store");
        throw err;
      }
    }

    restore()
      .then(({ client, passwordlessUser }) => {
        setState({
          client,
          loading: false,
          isAuthenticated: !!client,
          isPasswordlessUser: !!passwordlessUser,
          userName: client?.getUserIdLocalpart(),
        });
      })
      .catch(() => {
        setState({
          client: undefined,
          loading: false,
          isAuthenticated: false,
          isPasswordlessUser: false,
          userName: null,
        });
      });
  }, []);

  const changePassword = useCallback(
    async (password) => {
      const { tempPassword, passwordlessUser, ...existingSession } = JSON.parse(
        localStorage.getItem("matrix-auth-store")
      );

      await client.setPassword(
        {
          type: "m.login.password",
          identifier: {
            type: "m.id.user",
            user: existingSession.user_id,
          },
          user: existingSession.user_id,
          password: tempPassword,
        },
        password
      );

      localStorage.setItem(
        "matrix-auth-store",
        JSON.stringify({
          ...existingSession,
          passwordlessUser: false,
        })
      );

      setState({
        client,
        loading: false,
        isAuthenticated: true,
        isPasswordlessUser: false,
        userName: client.getUserIdLocalpart(),
      });
    },
    [client]
  );

  const setClient = useCallback((client, session) => {
    if (client) {
      localStorage.setItem("matrix-auth-store", JSON.stringify(session));

      setState({
        client,
        loading: false,
        isAuthenticated: true,
        isPasswordlessUser: !!session.passwordlessUser,
        userName: client.getUserIdLocalpart(),
      });
    } else {
      localStorage.removeItem("matrix-auth-store");

      setState({
        client: undefined,
        loading: false,
        isAuthenticated: false,
        isPasswordlessUser: false,
        userName: null,
      });
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
      isPasswordlessUser,
      client,
      changePassword,
      logout,
      userName,
      setClient,
    }),
    [
      loading,
      isAuthenticated,
      isPasswordlessUser,
      client,
      changePassword,
      logout,
      userName,
      setClient,
    ]
  );

  return (
    <ClientContext.Provider value={context}>{children}</ClientContext.Provider>
  );
}

export function useClient() {
  return useContext(ClientContext);
}

export function roomAliasFromRoomName(roomName) {
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

  await client.createGroupCall(
    room_id,
    GroupCallType.Video,
    GroupCallIntent.Prompt
  );

  return room_alias || room_id;
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
          roomId: room.getCanonicalAlias() || room.roomId,
          roomName: room.name,
          avatarUrl: null,
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

export function getRoomUrl(roomId) {
  if (roomId.startsWith("#")) {
    const [localPart, host] = roomId.replace("#", "").split(":");

    if (host !== defaultHomeserverHost) {
      return `${window.location.host}/room/${roomId}`;
    } else {
      return `${window.location.host}/${localPart}`;
    }
  } else {
    return `${window.location.host}/room/${roomId}`;
  }
}

export function getAvatarUrl(client, mxcUrl, avatarSize = 96) {
  const width = Math.floor(avatarSize * window.devicePixelRatio);
  const height = Math.floor(avatarSize * window.devicePixelRatio);
  return mxcUrl && client.mxcUrlToHttp(mxcUrl, width, height, "crop");
}

export function useProfile(client) {
  const [{ loading, displayName, avatarUrl, error, success }, setState] =
    useState(() => {
      const user = client?.getUser(client.getUserId());

      return {
        success: false,
        loading: false,
        displayName: user?.displayName,
        avatarUrl: user && client && getAvatarUrl(client, user.avatarUrl),
        error: null,
      };
    });

  useEffect(() => {
    const onChangeUser = (_event, { displayName, avatarUrl }) => {
      setState({
        success: false,
        loading: false,
        displayName,
        avatarUrl: getAvatarUrl(client, avatarUrl),
        error: null,
      });
    };

    let user;

    if (client) {
      const userId = client.getUserId();
      user = client.getUser(userId);
      user.on("User.displayName", onChangeUser);
      user.on("User.avatarUrl", onChangeUser);
    }

    return () => {
      if (user) {
        user.removeListener("User.displayName", onChangeUser);
        user.removeListener("User.avatarUrl", onChangeUser);
      }
    };
  }, [client]);

  const saveProfile = useCallback(
    async ({ displayName, avatar }) => {
      if (client) {
        setState((prev) => ({
          ...prev,
          loading: true,
          error: null,
          success: false,
        }));

        try {
          await client.setDisplayName(displayName);

          let mxcAvatarUrl;

          if (avatar) {
            mxcAvatarUrl = await client.uploadContent(avatar);
            await client.setAvatarUrl(mxcAvatarUrl);
          }

          setState((prev) => ({
            ...prev,
            displayName,
            avatarUrl: mxcAvatarUrl
              ? getAvatarUrl(client, mxcAvatarUrl)
              : prev.avatarUrl,
            loading: false,
            success: true,
          }));
        } catch (error) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error,
            success: false,
          }));
        }
      } else {
        console.error("Client not initialized before calling saveProfile");
      }
    },
    [client]
  );

  return { loading, error, displayName, avatarUrl, saveProfile, success };
}

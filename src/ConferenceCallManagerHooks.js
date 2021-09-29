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

import { useCallback, useEffect, useRef, useState } from "react";
import matrix from "matrix-js-sdk/src/index";
import { ConferenceCallDebugger } from "./ConferenceCallDebugger";

// https://stackoverflow.com/a/9039885
function isIOS() {
  return (
    [
      "iPad Simulator",
      "iPhone Simulator",
      "iPod Simulator",
      "iPad",
      "iPhone",
      "iPod",
    ].includes(navigator.platform) ||
    // iPad on iOS 13 detection
    (navigator.userAgent.includes("Mac") && "ontouchend" in document)
  );
}

function waitForSync(client) {
  return new Promise((resolve, reject) => {
    const onSync = (state) => {
      if (state === "PREPARED") {
        resolve();
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

export async function fetchRoom(client, roomIdOrAlias, timeout = 5000) {
  const { roomId } = await client.joinRoom(roomIdOrAlias);

  return new Promise((resolve, reject) => {
    let timeoutId;

    function onRoom(room) {
      if (room && room.roomId === roomId) {
        clearTimeout(timeoutId);
        client.removeListener("Room", onRoom);
        resolve(room);
      }
    }

    const room = client.getRoom(roomId);

    if (room) {
      resolve(room);
    }

    client.on("Room", onRoom);

    if (timeout) {
      timeoutId = setTimeout(() => {
        client.removeListener("Room", onRoom);
        reject(new Error("Fetching room timed out."));
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
          const { user_id, device_id, access_token } = JSON.parse(authStore);

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

  const login = useCallback(async (username, password) => {
    try {
      const registrationClient = matrix.createClient(homeserverUrl);

      const { user_id, device_id, access_token } =
        await registrationClient.loginWithPassword(username, password);

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

  const registerGuest = useCallback(async (displayName) => {
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

function usePageUnload(callback) {
  useEffect(() => {
    let pageVisibilityTimeout;

    function onBeforeUnload(event) {
      if (event.type === "visibilitychange") {
        if (document.visibilityState === "visible") {
          clearTimeout(pageVisibilityTimeout);
        } else {
          // Wait 5 seconds before closing the page to avoid accidentally leaving
          // TODO: Make this configurable?
          pageVisibilityTimeout = setTimeout(() => {
            callback();
          }, 5000);
        }
      } else {
        callback();
      }
    }

    // iOS doesn't fire beforeunload event, so leave the call when you hide the page.
    if (isIOS()) {
      window.addEventListener("pagehide", onBeforeUnload);
      document.addEventListener("visibilitychange", onBeforeUnload);
    }

    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      window.removeEventListener("pagehide", onBeforeUnload);
      document.removeEventListener("visibilitychange", onBeforeUnload);
      window.removeEventListener("beforeunload", onBeforeUnload);
      clearTimeout(pageVisibilityTimeout);
    };
  }, []);
}

function getParticipants(groupCall) {
  return [...groupCall.participants];
}

export function useGroupCall(client, roomId, debug = false) {
  const groupCallRef = useRef(null);

  const [
    {
      loading,
      entered,
      entering,
      room,
      participants,
      error,
      microphoneMuted,
      localVideoMuted,
      callDebugger,
    },
    setState,
  ] = useState({
    loading: true,
    entered: false,
    entering: false,
    room: null,
    participants: [],
    error: null,
    microphoneMuted: false,
    localVideoMuted: false,
    callDebugger: null,
  });

  const updateState = (state) =>
    setState((prevState) => ({ ...prevState, ...state }));

  useEffect(() => {
    function onParticipantsChanged(...args) {
      updateState({ participants: getParticipants(groupCallRef.current) });
    }

    function onLocalMuteStateChanged(microphoneMuted, localVideoMuted) {
      updateState({
        microphoneMuted,
        localVideoMuted,
      });
    }

    async function init() {
      const room = await fetchRoom(client, roomId, true);

      const groupCall = client.createGroupCall(roomId, "video");
      groupCallRef.current = groupCall;
      groupCall.on("active_speaker_changed", onParticipantsChanged);
      groupCall.on("participants_changed", onParticipantsChanged);
      groupCall.on("speaking", onParticipantsChanged);
      groupCall.on("mute_state_changed", onParticipantsChanged);
      groupCall.on("call_replaced", onParticipantsChanged);
      groupCall.on("call_feeds_changed", onParticipantsChanged);
      groupCall.on("local_mute_state_changed", onLocalMuteStateChanged);

      updateState({
        room,
        loading: false,
        callDebugger: debug
          ? new ConferenceCallDebugger(client, groupCall)
          : null,
      });
    }

    init().catch((error) => {
      if (groupCallRef.current) {
        const groupCall = groupCallRef.current;
        groupCall.removeListener(
          "active_speaker_changed",
          onParticipantsChanged
        );
        groupCall.removeListener("participants_changed", onParticipantsChanged);
        groupCall.removeListener("speaking", onParticipantsChanged);
        groupCall.removeListener("mute_state_changed", onParticipantsChanged);
        groupCall.removeListener("call_replaced", onParticipantsChanged);
        groupCall.removeListener("call_feeds_changed", onParticipantsChanged);
        groupCall.removeListener(
          "local_mute_state_changed",
          onLocalMuteStateChanged
        );
        groupCall.leave();
      }

      updateState({ error, loading: false });
    });

    return () => {
      if (groupCallRef.current) {
        groupCallRef.current.leave();
      }
    };
  }, [client, roomId]);

  usePageUnload(() => {
    if (groupCallRef.current) {
      groupCallRef.current.leave();
    }
  });

  const initLocalParticipant = useCallback(
    () => groupCallRef.current.initLocalParticipant(),
    []
  );

  const enter = useCallback(() => {
    updateState({ entering: true });

    groupCallRef.current
      .enter()
      .then(() => {
        updateState({
          entered: true,
          entering: false,
          participants: getParticipants(groupCallRef.current),
        });
      })
      .catch((error) => {
        updateState({ error, entering: false });
      });
  }, []);

  const leave = useCallback(() => {
    groupCallRef.current.leave();
    updateState({
      entered: false,
      participants: [],
      microphoneMuted: false,
      localVideoMuted: false,
    });
  }, []);

  const toggleLocalVideoMuted = useCallback(() => {
    groupCallRef.current.setLocalVideoMuted(
      !groupCallRef.current.isLocalVideoMuted()
    );
  }, []);

  const toggleMicrophoneMuted = useCallback(() => {
    groupCallRef.current.setMicrophoneMuted(
      !groupCallRef.current.isMicrophoneMuted()
    );
  }, []);

  return {
    loading,
    entered,
    entering,
    roomName: room ? room.name : null,
    participants,
    groupCall: groupCallRef.current,
    callDebugger: callDebugger,
    microphoneMuted,
    localVideoMuted,
    error,
    initLocalParticipant,
    enter,
    leave,
    toggleLocalVideoMuted,
    toggleMicrophoneMuted,
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

export function useRooms(client) {
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    function updateRooms() {
      const visibleRooms = client.getVisibleRooms();
      const sortedRooms = sortRooms(client, visibleRooms);
      setRooms(sortedRooms);
    }

    updateRooms();

    client.on("Room", updateRooms);

    return () => {
      client.removeListener("Room", updateRooms);
    };
  }, []);

  return rooms;
}

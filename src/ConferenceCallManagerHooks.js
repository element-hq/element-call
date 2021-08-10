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
import { ConferenceCallManager } from "./ConferenceCallManager";

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

export function useConferenceCallManager(homeserverUrl) {
  const [{ loading, authenticated, manager, error }, setState] = useState({
    loading: true,
    authenticated: false,
    manager: undefined,
    error: undefined,
  });

  useEffect(() => {
    ConferenceCallManager.restore(homeserverUrl)
      .then((manager) => {
        setState({
          manager,
          loading: false,
          authenticated: !!manager,
          error: undefined,
        });
      })
      .catch((err) => {
        console.error(err);

        setState({
          manager: undefined,
          loading: false,
          authenticated: false,
          error: err,
        });
      });
  }, []);

  const login = useCallback(async (username, password) => {
    setState((prevState) => ({
      ...prevState,
      authenticated: false,
      error: undefined,
    }));

    ConferenceCallManager.login(homeserverUrl, username, password)
      .then((manager) => {
        setState({
          manager,
          loading: false,
          authenticated: true,
          error: undefined,
        });
      })
      .catch((err) => {
        console.error(err);

        setState({
          manager: undefined,
          loading: false,
          authenticated: false,
          error: err,
        });
      });
  }, []);

  const register = useCallback(async (username, password) => {
    setState((prevState) => ({
      ...prevState,
      authenticated: false,
      error: undefined,
    }));

    ConferenceCallManager.register(homeserverUrl, username, password)
      .then((manager) => {
        setState({
          manager,
          loading: false,
          authenticated: true,
          error: undefined,
        });
      })
      .catch((err) => {
        console.error(err);

        setState({
          manager: undefined,
          loading: false,
          authenticated: false,
          error: err,
        });
      });
  }, []);

  useEffect(() => {
    window.confManager = manager;

    return () => {
      window.confManager = undefined;
    };
  }, [manager]);

  return { loading, authenticated, manager, error, login, register };
}

export function useVideoRoom(manager, roomId, timeout = 5000) {
  const [{ loading, joined, joining, room, participants, error }, setState] =
    useState({
      loading: true,
      joining: false,
      joined: false,
      room: undefined,
      participants: [],
      error: undefined,
    });

  useEffect(() => {
    setState((prevState) => ({
      ...prevState,
      loading: true,
      room: undefined,
      error: undefined,
    }));

    function onBeforeUnload(event) {
      if (
        event.type === "visibilitychange" &&
        document.visibilityState === "visible"
      ) {
        return;
      }

      manager.leaveCall();
    }

    // iOS doesn't fire beforeunload event, so leave the call when you hide the page.
    if (isIOS()) {
      window.addEventListener("pagehide", onBeforeUnload);
      document.addEventListener("visibilitychange", onBeforeUnload);
    }

    window.addEventListener("beforeunload", onBeforeUnload);

    const onParticipantsChanged = () => {
      setState((prevState) => ({
        ...prevState,
        participants: manager.participants,
      }));
    };

    manager.on("participants_changed", onParticipantsChanged);

    manager.client.joinRoom(roomId).catch((err) => {
      setState((prevState) => ({ ...prevState, loading: false, error: err }));
    });

    let timeoutId;

    function roomCallback(room) {
      if (room && room.roomId === roomId) {
        clearTimeout(timeoutId);
        manager.client.removeListener("Room", roomCallback);
        setState((prevState) => ({
          ...prevState,
          loading: false,
          room,
          error: undefined,
        }));
      }
    }

    let initialRoom = manager.client.getRoom(roomId);

    if (initialRoom) {
      setState((prevState) => ({
        ...prevState,
        loading: false,
        room: initialRoom,
        error: undefined,
      }));
    } else {
      manager.client.on("Room", roomCallback);

      timeoutId = setTimeout(() => {
        setState((prevState) => ({
          ...prevState,
          loading: false,
          room: undefined,
          error: new Error("Room could not be found."),
        }));
        manager.client.removeListener("Room", roomCallback);
      }, timeout);
    }

    return () => {
      manager.client.removeListener("Room", roomCallback);
      manager.removeListener("participants_changed", onParticipantsChanged);
      window.removeEventListener("pagehide", onBeforeUnload);
      document.removeEventListener("visibilitychange", onBeforeUnload);
      window.removeEventListener("beforeunload", onBeforeUnload);
      clearTimeout(timeoutId);
      manager.leaveCall();
    };
  }, [manager, roomId]);

  const joinCall = useCallback(() => {
    if (joining || joined) {
      return;
    }

    setState((prevState) => ({
      ...prevState,
      joining: true,
    }));

    manager
      .enter(roomId)
      .then(() => {
        setState((prevState) => ({
          ...prevState,
          joining: false,
          joined: true,
        }));
      })
      .catch((error) => {
        setState((prevState) => ({
          ...prevState,
          joining: false,
          joined: false,
          error,
        }));
      });
  }, [manager, roomId, joining, joined]);

  const leaveCall = useCallback(() => {
    manager.leaveCall();

    setState((prevState) => ({
      ...prevState,
      participants: manager.participants,
      joined: false,
      joining: false,
    }));
  }, [manager]);

  return {
    loading,
    joined,
    joining,
    room,
    participants,
    error,
    joinCall,
    leaveCall,
  };
}

export function useRooms(manager) {
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    function updateRooms() {
      setRooms(manager.client.getRooms());
    }

    updateRooms();

    manager.client.on("Room", updateRooms);

    return () => {
      manager.client.removeListener("Room", updateRooms);
    };
  }, []);

  return rooms;
}

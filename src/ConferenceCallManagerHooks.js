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
        console.log(manager);
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

  return { loading, authenticated, manager, error, login, register };
}

export function useVideoRoom(manager, roomId, timeout = 5000) {
  const [{ loading, joined, room, participants, error }, setState] = useState({
    loading: true,
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

    manager.client.joinRoom(roomId).catch((err) => {
      setState((prevState) => ({ ...prevState, loading: false, error: err }));
    });

    let initialRoom = manager.client.getRoom(roomId);

    if (initialRoom) {
      setState((prevState) => ({
        ...prevState,
        loading: false,
        room: initialRoom,
        error: undefined,
      }));
      return;
    }

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

    return () => {
      manager.client.removeListener("Room", roomCallback);
      clearTimeout(timeoutId);
    };
  }, [roomId]);

  const joinCall = useCallback(() => {
    const onParticipantsChanged = () => {
      setState((prevState) => ({
        ...prevState,
        participants: manager.participants,
      }));
    };

    manager.on("participants_changed", onParticipantsChanged);

    manager.join(roomId);

    setState((prevState) => ({
      ...prevState,
      joined: true,
    }));

    return () => {
      manager.removeListener("participants_changed", onParticipantsChanged);

      setState((prevState) => ({
        ...prevState,
        joined: false,
        participants: [],
      }));
    };
  }, [manager, roomId]);

  const leaveCall = useCallback(() => {
    manager.leaveCall();

    setState((prevState) => ({
      ...prevState,
      participants: manager.participants,
      joined: false,
    }));
  }, [manager]);

  return { loading, joined, room, participants, error, joinCall, leaveCall };
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

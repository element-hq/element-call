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

import React, { useCallback, useRef, useState } from "react";
import { useHistory, Link } from "react-router-dom";
import { useRooms } from "./ConferenceCallManagerHooks";

export function JoinOrCreateRoom({ manager }) {
  const history = useHistory();
  const roomNameRef = useRef();
  const roomIdRef = useRef();
  const [createRoomError, setCreateRoomError] = useState();
  const [joinRoomError, setJoinRoomError] = useState();
  const rooms = useRooms(manager);

  const onCreateRoom = useCallback(
    (e) => {
      e.preventDefault();
      setCreateRoomError(undefined);

      manager.client
        .createRoom({
          visibility: "private",
          preset: "public_chat",
          name: roomNameRef.current.value,
        })
        .then(({ room_id }) => {
          history.push(`/room/${room_id}`);
        })
        .catch(setCreateRoomError);
    },
    [manager]
  );

  const onJoinRoom = useCallback(
    (e) => {
      e.preventDefault();
      setJoinRoomError(undefined);

      manager.client
        .joinRoom(roomIdRef.current.value)
        .then(({ roomId }) => {
          history.push(`/room/${roomId}`);
        })
        .catch(setJoinRoomError);
    },
    [manager]
  );

  const onLogout = useCallback(
    (e) => {
      e.preventDefault();
      manager.logout();
      history.push("/");
    },
    [manager]
  );

  return (
    <div className="page">
      <h1>Matrix Video Chat</h1>
      <form onSubmit={onCreateRoom}>
        <h2>Create New Room</h2>
        <input
          id="roomName"
          name="roomName"
          type="text"
          required
          autoComplete="off"
          placeholder="Room Name"
          ref={roomNameRef}
        ></input>
        {createRoomError && <p>{createRoomError.message}</p>}
        <button type="submit">Create Room</button>
      </form>
      <form onSubmit={onJoinRoom}>
        <h2>Join Existing Room</h2>
        <input
          id="roomId"
          name="roomId"
          type="text"
          required
          autoComplete="off"
          placeholder="Room ID"
          ref={roomIdRef}
        ></input>
        {joinRoomError && <p>{joinRoomError.message}</p>}
        <button type="submit">Join Room</button>
      </form>
      <h2>Rooms:</h2>
      <ul>
        {rooms.map((room) => (
          <li key={room.roomId}>
            <Link to={`/room/${room.roomId}`}>{room.name}</Link>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onLogout}>
        Log Out
      </button>
    </div>
  );
}

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

import React, { useCallback, useEffect, useRef, useState } from "react";
import styles from "./App.module.css";
import {
  BrowserRouter as Router,
  Switch,
  Route,
  useHistory,
  useParams,
  Link,
  Redirect,
} from "react-router-dom";
import {
  useConferenceCallManager,
  useVideoRoom,
  useRooms,
} from "./ConferenceCallManagerHooks";

export default function App() {
  const { protocol, host } = window.location;
  // Assume homeserver is hosted on same domain (proxied in development by vite)
  const homeserverUrl = `${protocol}//${host}`;
  const { loading, authenticated, error, manager, login, register } =
    useConferenceCallManager(homeserverUrl);

  return (
    <Router>
      <div className={styles.app}>
        {error && <p>{error.message}</p>}
        {loading ? (
          <p>Loading...</p>
        ) : (
          <Switch>
            <Route exact path="/">
              {authenticated ? (
                <JoinOrCreateRoom manager={manager} />
              ) : (
                <LoginOrRegister onRegister={register} onLogin={login} />
              )}
            </Route>
            <Route path="/room/:roomId">
              {!authenticated ? (
                <Redirect to="/" />
              ) : (
                <Room manager={manager} />
              )}
            </Route>
          </Switch>
        )}
      </div>
    </Router>
  );
}

function LoginOrRegister({ onRegister, onLogin }) {
  const registerUsernameRef = useRef();
  const registerPasswordRef = useRef();
  const loginUsernameRef = useRef();
  const loginPasswordRef = useRef();

  const onSubmitRegisterForm = useCallback((e) => {
    e.preventDefault();
    onRegister(usernameRef.current.value, passwordRef.current.value);
  });

  const onSubmitLoginForm = useCallback((e) => {
    e.preventDefault();
    onLogin(usernameRef.current.value, passwordRef.current.value);
  });

  return (
    <div className={styles.page}>
      <h1>Matrix Video Chat</h1>
      <h2>Register</h2>
      <form onSubmit={onSubmitRegisterForm}>
        <input
          type="text"
          ref={registerUsernameRef}
          placeholder="Username"
        ></input>
        <input
          type="password"
          ref={registerPasswordRef}
          placeholder="Password"
        ></input>
        <button type="submit">Register</button>
      </form>
      <h2>Login</h2>
      <form onSubmit={onSubmitLoginForm}>
        <input
          type="text"
          ref={loginUsernameRef}
          placeholder="Username"
        ></input>
        <input
          type="password"
          ref={loginPasswordRef}
          placeholder="Password"
        ></input>
        <button type="submit">Login</button>
      </form>
    </div>
  );
}

function JoinOrCreateRoom({ manager }) {
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

  return (
    <div className={styles.page}>
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
    </div>
  );
}

function Room({ manager }) {
  const { roomId } = useParams();
  const { loading, joined, room, participants, error, joinCall } = useVideoRoom(
    manager,
    roomId
  );

  return (
    <div className={styles.room}>
      {!loading && room && (
        <div className={styles.header}>
          <h3>{room.name}</h3>
          <div className={styles.userNav}>
            <h5>{manager.client.getUserId()}</h5>
          </div>
        </div>
      )}
      {loading && (
        <div className={styles.centerMessage}>
          <p>Loading room...</p>
        </div>
      )}
      {error && <div className={styles.centerMessage}>{error.message}</div>}
      {!loading && room && !joined && (
        <div className={styles.joinRoom}>
          <h3>Members:</h3>
          <ul>
            {room.getMembers().map((member) => (
              <li key={member.userId}>{member.name}</li>
            ))}
          </ul>
          <button onClick={joinCall}>Join Call</button>
        </div>
      )}
      {!loading && room && joined && participants.length === 0 && (
        <div className={styles.centerMessage}>
          <p>Waiting for other participants...</p>
        </div>
      )}
      {!loading && room && joined && participants.length > 0 && (
        <div className={styles.roomContainer}>
          {participants.map((participant) => (
            <Participant key={participant.userId} participant={participant} />
          ))}
        </div>
      )}
    </div>
  );
}

function Participant({ participant }) {
  const videoRef = useRef();

  useEffect(() => {
    if (participant.feed) {
      if (participant.muted) {
        videoRef.current.muted = true;
      }

      videoRef.current.srcObject = participant.feed.stream;
      videoRef.current.play();
    }
  }, [participant.feed]);

  return (
    <div className={styles.participant}>
      <video ref={videoRef}></video>
      <div className={styles.participantLabel}>
        <p>
          {participant.userId} {participant.local && "(You)"}
        </p>
      </div>
    </div>
  );
}

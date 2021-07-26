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
import "./App.css";
import {
  BrowserRouter as Router,
  Switch,
  Route,
  useHistory,
  useParams,
  Link,
  Redirect,
} from "react-router-dom";
import { ConferenceCall } from "./ConferenceCall";

export default function App() {
  const { protocol, host } = window.location;
  // Assume homeserver is hosted on same domain (proxied in development by vite)
  const homeserverUrl = `${protocol}//${host}`;
  const { loading, authenticated, error, client, login, register } =
    useClient(homeserverUrl);

  return (
    <Router>
      <div className="App">
        {error && <p>{error.message}</p>}
        {loading ? (
          <p>Loading...</p>
        ) : (
          <Switch>
            <Route exact path="/">
              {authenticated ? (
                <JoinOrCreateRoom client={client} />
              ) : (
                <>
                  <Register onRegister={register} />
                  <Login onLogin={login} />
                </>
              )}
            </Route>
            <Route path="/room/:roomId">
              {!authenticated ? <Redirect to="/" /> : <Room client={client} />}
            </Route>
          </Switch>
        )}
      </div>
    </Router>
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

function useClient(homeserverUrl) {
  const [{ loading, authenticated, client, error }, setState] = useState({
    loading: true,
    authenticated: false,
    client: undefined,
    error: undefined,
  });

  useEffect(() => {
    async function restoreClient() {
      try {
        const authStore = localStorage.getItem("matrix-auth-store");

        if (authStore) {
          const { user_id, device_id, access_token } = JSON.parse(authStore);

          const client = matrixcs.createClient({
            baseUrl: homeserverUrl,
            accessToken: access_token,
            userId: user_id,
            deviceId: device_id,
          });

          await client.startClient();

          await waitForSync(client);

          setState({
            client,
            loading: false,
            authenticated: true,
            error: undefined,
          });
        } else {
          setState({
            client: undefined,
            loading: false,
            authenticated: false,
            error: undefined,
          });
        }
      } catch (err) {
        console.error(err);
        localStorage.removeItem("matrix-auth-store");
        setState({
          client: undefined,
          loading: false,
          authenticated: false,
          error: err,
        });
      }
    }

    restoreClient();
  }, []);

  const login = useCallback(async (username, password) => {
    try {
      setState((prevState) => ({
        ...prevState,
        authenticated: false,
        error: undefined,
      }));

      const registrationClient = matrixcs.createClient(homeserverUrl);

      const { user_id, device_id, access_token } =
        await registrationClient.loginWithPassword(username, password);

      const client = matrixcs.createClient({
        baseUrl: homeserverUrl,
        accessToken: access_token,
        userId: user_id,
        deviceId: device_id,
      });

      await client.startClient();

      localStorage.setItem(
        "matrix-auth-store",
        JSON.stringify({ user_id, device_id, access_token })
      );
      setState({
        client,
        loading: false,
        authenticated: true,
        error: undefined,
      });
    } catch (err) {
      console.error(err);
      localStorage.removeItem("matrix-auth-store");
      setState({
        client: undefined,
        loading: false,
        authenticated: false,
        error: err,
      });
    }
  }, []);

  const register = useCallback(async (username, password) => {
    try {
      setState((prevState) => ({
        ...prevState,
        authenticated: false,
        error: undefined,
      }));

      const registrationClient = matrixcs.createClient(homeserverUrl);

      const { user_id, device_id, access_token } =
        await registrationClient.register(username, password, null, {
          type: "m.login.dummy",
        });

      const client = matrixcs.createClient({
        baseUrl: homeserverUrl,
        accessToken: access_token,
        userId: user_id,
        deviceId: device_id,
      });

      await client.startClient();

      localStorage.setItem(
        "matrix-auth-store",
        JSON.stringify({ user_id, device_id, access_token })
      );
      setState({
        client,
        loading: false,
        authenticated: true,
        error: undefined,
      });
    } catch (err) {
      localStorage.removeItem("matrix-auth-store");
      setState({
        client: undefined,
        loading: false,
        authenticated: false,
        error: err,
      });
    }
  }, []);

  return { loading, authenticated, client, error, login, register };
}

function Register({ onRegister }) {
  const usernameRef = useRef();
  const passwordRef = useRef();

  const onSubmit = useCallback((e) => {
    e.preventDefault();
    onRegister(usernameRef.current.value, passwordRef.current.value);
  });

  return (
    <form onSubmit={onSubmit}>
      <input type="text" ref={usernameRef} placeholder="Username"></input>
      <input type="password" ref={passwordRef} placeholder="Password"></input>
      <button type="submit">Register</button>
    </form>
  );
}

function Login({ onLogin }) {
  const usernameRef = useRef();
  const passwordRef = useRef();

  const onSubmit = useCallback((e) => {
    e.preventDefault();
    onLogin(usernameRef.current.value, passwordRef.current.value);
  });

  return (
    <form onSubmit={onSubmit}>
      <input type="text" ref={usernameRef} placeholder="Username"></input>
      <input type="password" ref={passwordRef} placeholder="Password"></input>
      <button type="submit">Login</button>
    </form>
  );
}

function JoinOrCreateRoom({ client }) {
  const history = useHistory();
  const roomNameRef = useRef();
  const roomIdRef = useRef();
  const [createRoomError, setCreateRoomError] = useState();
  const [joinRoomError, setJoinRoomError] = useState();
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    function updateRooms() {
      setRooms(client.getRooms());
    }

    updateRooms();

    client.on("Room", updateRooms);

    return () => {
      client.removeListener("Room", updateRooms);
    };
  }, []);

  const onCreateRoom = useCallback(
    (e) => {
      e.preventDefault();
      setCreateRoomError(undefined);

      client
        .createRoom({
          visibility: "private",
          preset: "public_chat",
          name: roomNameRef.current.value,
        })
        .then(({ room_id }) => {
          history.push(`/rooms/${room_id}`);
        })
        .catch(setCreateRoomError);
    },
    [client]
  );

  const onJoinRoom = useCallback(
    (e) => {
      e.preventDefault();
      setJoinRoomError(undefined);

      client
        .joinRoom(roomIdRef.current.value)
        .then(({ roomId }) => {
          history.push(`/rooms/${roomId}`);
        })
        .catch(setJoinRoomError);
    },
    [client]
  );

  return (
    <div>
      <form onSubmit={onCreateRoom}>
        <h3>Create New Room</h3>
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
        <h3>Join Existing Room</h3>
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
      <h3>Rooms:</h3>
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

function useVideoRoom(client, roomId, timeout = 5000) {
  const [
    { loading, joined, room, conferenceCall, participants, error },
    setState,
  ] = useState({
    loading: true,
    joined: false,
    room: undefined,
    participants: [],
    error: undefined,
    conferenceCall: null,
  });

  useEffect(() => {
    const conferenceCall = new ConferenceCall(client, roomId);

    setState((prevState) => ({
      ...prevState,
      conferenceCall,
      loading: true,
      room: undefined,
      error: undefined,
    }));

    client.joinRoom(roomId).catch((err) => {
      setState((prevState) => ({ ...prevState, loading: false, error: err }));
    });

    let initialRoom = client.getRoom(roomId);

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
        client.removeListener("Room", roomCallback);
        setState((prevState) => ({
          ...prevState,
          loading: false,
          room,
          error: undefined,
        }));
      }
    }

    client.on("Room", roomCallback);

    timeoutId = setTimeout(() => {
      setState((prevState) => ({
        ...prevState,
        loading: false,
        room: undefined,
        error: new Error("Room could not be found."),
      }));
      client.removeListener("Room", roomCallback);
    }, timeout);

    return () => {
      client.removeListener("Room", roomCallback);
      clearTimeout(timeoutId);
    };
  }, [roomId]);

  const joinCall = useCallback(() => {
    const onParticipantsChanged = () => {
      setState((prevState) => ({
        ...prevState,
        participants: conferenceCall.participants,
      }));
    };

    conferenceCall.on("participants_changed", onParticipantsChanged);

    conferenceCall.join();

    setState((prevState) => ({
      ...prevState,
      joined: true,
    }));

    return () => {
      conferenceCall.removeListener(
        "participants_changed",
        onParticipantsChanged
      );

      setState((prevState) => ({
        ...prevState,
        joined: false,
        participants: [],
      }));
    };
  }, [client, conferenceCall, roomId]);

  return { loading, joined, room, participants, error, joinCall };
}

function Room({ client }) {
  const { roomId } = useParams();
  const { loading, joined, room, participants, error, joinCall } = useVideoRoom(
    client,
    roomId
  );

  return (
    <div>
      <p>User ID:{client.getUserId()}</p>
      <p>Room ID:{roomId}</p>
      {loading && <p>Loading room...</p>}
      {error && <p>{error.message}</p>}
      {!loading && room && (
        <>
          <h3>Members:</h3>
          <ul>
            {room.getMembers().map((member) => (
              <li key={member.userId}>{member.name}</li>
            ))}
          </ul>
          {joined ? (
            participants.map((participant) => (
              <Participant key={participant.userId} participant={participant} />
            ))
          ) : (
            <button onClick={joinCall}>Join Call</button>
          )}
        </>
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
    <li>
      <h3>
        User ID:{participant.userId} {participant.local && "(Local)"}
      </h3>
      {!participant.local && (
        <>
          <h3>Calls:</h3>
          <ul>
            {participant.calls.map((call) => (
              <li key={call.callId}>
                <p>Call ID: {call.callId}</p>
                <p>Direction: {call.direction}</p>
                <p>State: {call.state}</p>
                <p>Hangup Reason: {call.hangupReason}</p>
              </li>
            ))}
          </ul>
        </>
      )}
      <video ref={videoRef}></video>
    </li>
  );
}

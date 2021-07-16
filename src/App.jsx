import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  createContext,
  useContext,
} from "react";
import * as sdk from "matrix-js-sdk";
import "./App.css";

const ClientContext = createContext();

export default function App() {
  const { protocol, host } = window.location;
  // Assume homeserver is hosted on same domain (proxied in development by vite)
  const homeserverUrl = `${protocol}//${host}`;
  const { loading, authenticated, error, client, login, register } =
    useClient(homeserverUrl);
  const [roomId, setRoomId] = useState();

  return (
    <ClientContext.Provider value={client}>
      <div className="App">
        {error && <p>{error.message}</p>}
        {loading ? (
          <p>Loading...</p>
        ) : (
          <>
            {!authenticated && <Register onRegister={register} />}
            {!authenticated && <Login onLogin={login} />}
            {authenticated && !roomId && (
              <JoinOrCreateRoom onSetRoomId={setRoomId} />
            )}
            {authenticated && roomId && <Room roomId={roomId} />}
          </>
        )}
      </div>
    </ClientContext.Provider>
  );
}

function useClient(homeserverUrl) {
  const [authenticated, setAuthenticated] = useState(false);
  const [client, setClient] = useState();
  const [error, setError] = useState();

  useEffect(() => {
    async function restoreClient() {
      try {
        const authStore = localStorage.getItem("matrix-auth-store");

        if (authStore) {
          const { user_id, device_id, access_token } = JSON.parse(authStore);

          const client = sdk.createClient({
            baseUrl: homeserverUrl,
            accessToken: access_token,
            userId: user_id,
            deviceId: device_id,
          });

          await client.startClient();

          setAuthenticated(true);
          setClient(client);
        }
      } catch (err) {
        console.error(err);
        localStorage.removeItem("matrix-auth-store");
        setAuthenticated(false);
        setError(err);
      }
    }

    restoreClient();
  }, []);

  const login = useCallback(async (username, password) => {
    try {
      setError(undefined);

      const registrationClient = sdk.createClient(homeserverUrl);

      const { user_id, device_id, access_token } =
        await registrationClient.loginWithPassword(username, password);

      const client = sdk.createClient({
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
      setAuthenticated(true);
      setClient(client);
    } catch (err) {
      console.error(err);
      localStorage.removeItem("matrix-auth-store");
      setAuthenticated(false);
      setError(err);
    }
  }, []);

  const register = useCallback(
    async (username, password) => {
      try {
        setError(undefined);

        const registrationClient = sdk.createClient(homeserverUrl);

        const { user_id, device_id, access_token } =
          await registrationClient.register(username, password, null, {
            type: "m.login.dummy",
          });

        const client = sdk.createClient({
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
        setAuthenticated(true);
        setClient(client);
      } catch (err) {
        localStorage.removeItem("matrix-auth-store");
        setAuthenticated(false);
        setError(err);
      }
    },
    [client, homeserverUrl]
  );

  return { authenticated, client, error, login, register };
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

function JoinOrCreateRoom({ onSetRoomId }) {
  const client = useContext(ClientContext);
  const roomNameRef = useRef();
  const roomIdRef = useRef();
  const [createRoomError, setCreateRoomError] = useState();
  const [joinRoomError, setJoinRoomError] = useState();

  const onCreateRoom = useCallback(
    (e) => {
      e.preventDefault();
      setCreateRoomError(undefined);

      client
        .createRoom({
          visibility: "private",
          name: roomNameRef.current.value,
        })
        .then(({ room_id }) => {
          onSetRoomId(room_id);
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
          onSetRoomId(roomId);
        })
        .catch(setJoinRoomError);
    },
    [client]
  );

  return (
    <div>
      <form onSubmit={onCreateRoom}>
        <p>Create New Room</p>
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
        <p>Join Existing Room</p>
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
    </div>
  );
}

function useVideoRoom(roomId, timeout = 5000) {
  const client = useContext(ClientContext);

  const [room, setRoom] = useState();
  const [error, setError] = useState();

  useEffect(() => {
    setRoom(undefined);

    let initialRoom = client.getRoom(roomId);

    if (initialRoom) {
      setRoom(initialRoom);
      return;
    }

    let timeoutId;

    function roomCallback(room) {
      if (room && room.roomId === roomId) {
        clearTimeout(timeoutId);
        client.removeListener("Room", roomCallback);
        setRoom(room);
      }
    }

    client.on("Room", roomCallback);

    timeoutId = setTimeout(() => {
      setError(new Error("Room could not be found."));
      client.removeListener("Room", roomCallback);
    }, timeout);

    return () => {
      client.removeListener("Room", roomCallback);
      clearTimeout(timeoutId);
    };
  }, [roomId]);

  return { room, error };
}

function Room({ roomId }) {
  const { room, error } = useVideoRoom(roomId);

  useEffect(() => {
    if (room) {
      console.log(room);
    }
  }, [room]);

  return (
    <div>
      <p>{roomId}</p>
      {!error && !room && <p>Loading room...</p>}
      {error && <p>{error.message}</p>}
    </div>
  );
}

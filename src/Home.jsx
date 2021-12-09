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

import React, { useCallback } from "react";
import { useHistory } from "react-router-dom";
import {
  useClient,
  useGroupCallRooms,
  usePublicRooms,
  useCreateRoom,
  useCreateRoomAsPasswordlessUser,
} from "./ConferenceCallManagerHooks";
import { Header, HeaderLogo, LeftNav, RightNav } from "./Header";
import styles from "./Home.module.css";
import { FieldRow, InputField, ErrorMessage } from "./Input";
import { UserMenu } from "./UserMenu";
import { Button } from "./button";
import { CallList } from "./CallList";
import classNames from "classnames";
import { ErrorModal } from "./ErrorModal";

export function Home() {
  const { isAuthenticated, isGuest, loading, error, client } = useClient();

  if (loading) {
    return <div>Loading...</div>;
  } else if (error) {
    return <ErrorModal error={error} />;
  } else if (!isAuthenticated || isGuest) {
    return <UnregisteredView />;
  } else {
    return <RegisteredView client={client} />;
  }
}

function UnregisteredView() {
  const history = useHistory();
  const { createRoomError, creatingRoom, createRoom } =
    useCreateRoomAsPasswordlessUser();

  const onCreateRoom = useCallback(
    (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      const roomName = data.get("roomName");
      const userName = data.get("userName");

      createRoom(roomName, userName).then((roomIdOrAlias) => {
        history.push(`/room/${roomIdOrAlias}`);
      });
    },
    [history]
  );

  const onJoinRoom = useCallback(
    (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      const roomId = data.get("roomId");
      history.push(`/room/${roomId}`);
    },
    [history]
  );

  return (
    <div className={styles.home}>
      <div className={classNames(styles.left, styles.fullWidth)}>
        <Header>
          <LeftNav>
            <HeaderLogo />
          </LeftNav>
          <RightNav>
            <UserMenu />
          </RightNav>
        </Header>
        <div className={styles.content}>
          <div className={styles.centered}>
            <form onSubmit={onJoinRoom}>
              <h1>Join a call</h1>
              <FieldRow className={styles.fieldRow}>
                <InputField
                  id="roomId"
                  name="roomId"
                  label="Call ID"
                  type="text"
                  required
                  autoComplete="off"
                  placeholder="Call ID"
                />
              </FieldRow>
              <FieldRow className={styles.fieldRow}>
                <Button className={styles.button} type="submit">
                  Join call
                </Button>
              </FieldRow>
            </form>
            <hr />
            <form onSubmit={onCreateRoom}>
              <h1>Create a call</h1>
              <FieldRow className={styles.fieldRow}>
                <InputField
                  id="userName"
                  name="userName"
                  label="Username"
                  type="text"
                  required
                  autoComplete="off"
                  placeholder="Username"
                />
              </FieldRow>
              <FieldRow className={styles.fieldRow}>
                <InputField
                  id="roomName"
                  name="roomName"
                  label="Room Name"
                  type="text"
                  required
                  autoComplete="off"
                  placeholder="Room Name"
                />
              </FieldRow>
              {createRoomError && (
                <FieldRow className={styles.fieldRow}>
                  <ErrorMessage>{createRoomError.message}</ErrorMessage>
                </FieldRow>
              )}
              <FieldRow className={styles.fieldRow}>
                <Button
                  className={styles.button}
                  type="submit"
                  disabled={creatingRoom}
                >
                  {creatingRoom ? "Creating call..." : "Create call"}
                </Button>
              </FieldRow>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

function RegisteredView({ client }) {
  const history = useHistory();
  const { createRoomError, creatingRoom, createRoom } = useCreateRoom(client);

  const onCreateRoom = useCallback(
    (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      const roomName = data.get("roomName");

      createRoom(roomName).then((roomIdOrAlias) => {
        history.push(`/room/${roomIdOrAlias}`);
      });
    },
    [history]
  );

  const onJoinRoom = useCallback(
    (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      const roomId = data.get("roomId");
      history.push(`/room/${roomId}`);
    },
    [history]
  );
  const publicRooms = usePublicRooms(
    client,
    import.meta.env.VITE_PUBLIC_SPACE_ROOM_ID
  );
  const recentRooms = useGroupCallRooms(client);

  const hideCallList = publicRooms.length === 0 && recentRooms.length === 0;

  return (
    <div className={styles.home}>
      <div
        className={classNames(styles.left, {
          [styles.fullWidth]: hideCallList,
        })}
      >
        <Header>
          <LeftNav>
            <HeaderLogo />
          </LeftNav>
          {hideCallList && (
            <RightNav>
              <UserMenu />
            </RightNav>
          )}
        </Header>
        <div className={styles.content}>
          <div className={styles.centered}>
            <form onSubmit={onJoinRoom}>
              <h1>Join a call</h1>
              <FieldRow className={styles.fieldRow}>
                <InputField
                  id="roomId"
                  name="roomId"
                  label="Call ID"
                  type="text"
                  required
                  autoComplete="off"
                  placeholder="Call ID"
                />
              </FieldRow>
              <FieldRow className={styles.fieldRow}>
                <Button className={styles.button} type="submit">
                  Join call
                </Button>
              </FieldRow>
            </form>
            <hr />
            <form onSubmit={onCreateRoom}>
              <h1>Create a call</h1>
              <FieldRow className={styles.fieldRow}>
                <InputField
                  id="roomName"
                  name="roomName"
                  label="Room Name"
                  type="text"
                  required
                  autoComplete="off"
                  placeholder="Room Name"
                />
              </FieldRow>
              {createRoomError && (
                <FieldRow className={styles.fieldRow}>
                  <ErrorMessage>{createRoomError.message}</ErrorMessage>
                </FieldRow>
              )}
              <FieldRow className={styles.fieldRow}>
                <Button
                  className={styles.button}
                  type="submit"
                  disabled={creatingRoom}
                >
                  {creatingRoom ? "Creating call..." : "Create call"}
                </Button>
              </FieldRow>
            </form>
          </div>
        </div>
      </div>
      {!hideCallList && (
        <div className={styles.right}>
          <Header>
            <LeftNav />
            <RightNav>
              <UserMenu />
            </RightNav>
          </Header>
          <div className={styles.content}>
            {publicRooms.length > 0 && (
              <CallList title="Public Calls" rooms={publicRooms} />
            )}
            {recentRooms.length > 0 && (
              <CallList title="Recent Calls" rooms={recentRooms} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

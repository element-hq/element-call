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
import { Header, LeftNav, UserNav } from "./Header";
import ColorHash from "color-hash";
import styles from "./Home.module.css";
import { FieldRow, InputField, Button, ErrorMessage } from "./Input";
import { Center, Content, Sidebar, Modal } from "./Layout";

const colorHash = new ColorHash({ lightness: 0.3 });

export function Home({ manager }) {
  const history = useHistory();
  const roomNameRef = useRef();
  const [createRoomError, setCreateRoomError] = useState();
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

  const onLogout = useCallback(
    (e) => {
      e.preventDefault();
      manager.logout();
      location.reload();
    },
    [manager]
  );

  return (
    <>
      <Header>
        <LeftNav />
        <UserNav
          signedIn={manager.client}
          userName={manager.client.getUserId()}
          onLogout={onLogout}
        />
      </Header>
      <Content className={styles.content}>
        <Sidebar>
          <h5>Rooms:</h5>
          <div className={styles.roomList}>
            {rooms.map((room) => (
              <Link
                className={styles.roomListItem}
                key={room.roomId}
                to={`/room/${room.roomId}`}
              >
                <div
                  className={styles.roomAvatar}
                  style={{ backgroundColor: colorHash.hex(room.name) }}
                >
                  <span>{room.name.slice(0, 1)}</span>
                </div>
                <div className={styles.roomName}>{room.name}</div>
              </Link>
            ))}
          </div>
        </Sidebar>
        <Center>
          <Modal>
            <form onSubmit={onCreateRoom}>
              <h2>Create New Room</h2>
              <FieldRow>
                <InputField
                  id="roomName"
                  name="roomName"
                  label="Room Name"
                  type="text"
                  required
                  autoComplete="off"
                  placeholder="Room Name"
                  ref={roomNameRef}
                />
              </FieldRow>
              {createRoomError && (
                <FieldRow>
                  <ErrorMessage>{createRoomError.message}</ErrorMessage>
                </FieldRow>
              )}
              <FieldRow rightAlign>
                <Button type="submit">Create Room</Button>
              </FieldRow>
            </form>
          </Modal>
        </Center>
      </Content>
    </>
  );
}

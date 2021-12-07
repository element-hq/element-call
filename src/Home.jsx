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

import React, { useCallback, useState } from "react";
import { useHistory, Link } from "react-router-dom";
import {
  useGroupCallRooms,
  usePublicRooms,
} from "./ConferenceCallManagerHooks";
import { Header, HeaderLogo, LeftNav, RightNav } from "./Header";
import ColorHash from "color-hash";
import styles from "./Home.module.css";
import { FieldRow, InputField, ErrorMessage } from "./Input";
import { Center, Content, Modal } from "./Layout";
import {
  GroupCallIntent,
  GroupCallType,
} from "matrix-js-sdk/src/browser-index";
import { Facepile } from "./Facepile";
import { UserMenu } from "./UserMenu";
import { Button } from "./button";

const colorHash = new ColorHash({ lightness: 0.3 });

function roomAliasFromRoomName(roomName) {
  return roomName
    .trim()
    .replace(/\s/g, "-")
    .replace(/[^\w-]/g, "")
    .toLowerCase();
}

export function Home({ client, onLogout }) {
  const history = useHistory();
  const [roomName, setRoomName] = useState("");
  const [roomAlias, setRoomAlias] = useState("");
  const [guestAccess, setGuestAccess] = useState(false);
  const [createRoomError, setCreateRoomError] = useState();
  const [showAdvanced, setShowAdvanced] = useState();
  const rooms = useGroupCallRooms(client);
  const publicRooms = usePublicRooms(
    client,
    import.meta.env.VITE_PUBLIC_SPACE_ROOM_ID
  );

  const onCreateRoom = useCallback(
    (e) => {
      e.preventDefault();
      setCreateRoomError(undefined);

      async function createRoom(name, roomAlias, guestAccess) {
        const { room_id, room_alias } = await client.createRoom({
          visibility: "private",
          preset: "public_chat",
          name,
          room_alias_name: roomAlias,
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

        if (guestAccess) {
          await client.setGuestAccess(room_id, {
            allowJoin: true,
            allowRead: true,
          });
        }

        await client.createGroupCall(
          room_id,
          GroupCallType.Video,
          GroupCallIntent.Prompt
        );

        history.push(`/room/${room_alias || room_id}`);
      }

      const data = new FormData(e.target);
      const roomName = data.get("roomName");
      const roomAlias = data.get("roomAlias");
      const guestAccess = data.get("guestAccess");

      createRoom(roomName, roomAlias, guestAccess).catch((error) => {
        setCreateRoomError(error);
        setShowAdvanced(true);
      });
    },
    [client]
  );

  return (
    <>
      <Header>
        <LeftNav>
          <HeaderLogo />
        </LeftNav>
        <RightNav>
          <UserMenu
            signedIn
            userName={client.getUserIdLocalpart()}
            onLogout={onLogout}
          />
        </RightNav>
      </Header>
      <Content>
        <Center>
          <Modal>
            <section>
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
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                  />
                </FieldRow>
                <details open={showAdvanced}>
                  <summary>Advanced</summary>
                  <FieldRow>
                    <InputField
                      id="roomAlias"
                      name="roomAlias"
                      label="Room Alias"
                      type="text"
                      autoComplete="off"
                      placeholder="Room Alias"
                      value={roomAlias || roomAliasFromRoomName(roomName)}
                      onChange={(e) => setRoomAlias(e.target.value)}
                    />
                  </FieldRow>
                  <FieldRow>
                    <InputField
                      id="guestAccess"
                      name="guestAccess"
                      label="Allow Guest Access"
                      type="checkbox"
                      checked={guestAccess}
                      onChange={(e) => setGuestAccess(e.target.checked)}
                    />
                  </FieldRow>
                </details>
                {createRoomError && (
                  <FieldRow>
                    <ErrorMessage>{createRoomError.message}</ErrorMessage>
                  </FieldRow>
                )}
                <FieldRow rightAlign>
                  <Button type="submit">Create Room</Button>
                </FieldRow>
              </form>
            </section>
            {publicRooms.length > 0 && (
              <section>
                <h3>Public Rooms</h3>
                <div className={styles.roomList}>
                  {publicRooms.map((room) => (
                    <Link
                      className={styles.roomListItem}
                      key={room.room_id}
                      to={`/room/${room.room_id}`}
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
              </section>
            )}
            <section>
              <h3>Recent Rooms</h3>
              <div className={styles.roomList}>
                {rooms.map(({ room, participants }) => (
                  <Link
                    className={styles.roomListItem}
                    key={room.roomId}
                    to={`/room/${room.getCanonicalAlias() || room.roomId}`}
                  >
                    <div
                      className={styles.roomAvatar}
                      style={{ backgroundColor: colorHash.hex(room.name) }}
                    >
                      <span>{room.name.slice(0, 1)}</span>
                    </div>
                    <div className={styles.roomName}>{room.name}</div>
                    <Facepile participants={participants} />
                  </Link>
                ))}
              </div>
            </section>
          </Modal>
        </Center>
      </Content>
    </>
  );
}

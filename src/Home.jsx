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
import { useHistory } from "react-router-dom";
import {
  useGroupCallRooms,
  usePublicRooms,
} from "./ConferenceCallManagerHooks";
import { Header, HeaderLogo, LeftNav, RightNav } from "./Header";
import styles from "./Home.module.css";
import { FieldRow, InputField, ErrorMessage } from "./Input";
import {
  GroupCallIntent,
  GroupCallType,
} from "matrix-js-sdk/src/browser-index";
import { UserMenu } from "./UserMenu";
import { Button } from "./button";
import { CallTile } from "./CallTile";

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
  const [guestAccess, setGuestAccess] = useState(false);
  const [createRoomError, setCreateRoomError] = useState();
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
      const guestAccess = data.get("guestAccess");

      createRoom(roomName, roomAliasFromRoomName(roomName), guestAccess).catch(
        (error) => {
          setCreateRoomError(error);
          setShowAdvanced(true);
        }
      );
    },
    [client]
  );

  const [roomId, setRoomId] = useState("");

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
    <div class={styles.home}>
      <div className={styles.left}>
        <Header>
          <LeftNav>
            <HeaderLogo />
          </LeftNav>
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
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
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
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
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
              {createRoomError && (
                <FieldRow className={styles.fieldRow}>
                  <ErrorMessage>{createRoomError.message}</ErrorMessage>
                </FieldRow>
              )}
              <FieldRow className={styles.fieldRow}>
                <Button className={styles.button} type="submit">
                  Create call
                </Button>
              </FieldRow>
            </form>
          </div>
        </div>
      </div>
      <div className={styles.right}>
        <Header>
          <LeftNav />
          <RightNav>
            <UserMenu
              signedIn
              userName={client.getUserIdLocalpart()}
              onLogout={onLogout}
            />
          </RightNav>
        </Header>
        <div className={styles.content}>
          {publicRooms.length > 0 && (
            <>
              <h3>Public Calls</h3>
              <div className={styles.roomList}>
                {publicRooms.map((room) => (
                  <CallTile
                    key={room.room_id}
                    name={room.name}
                    avatarUrl={null}
                    roomUrl={`/room/${room.room_id}`}
                  />
                ))}
              </div>
            </>
          )}
          <h3>Recent Calls</h3>
          <div className={styles.roomList}>
            {rooms.map(({ room, participants }) => (
              <CallTile
                key={room.roomId}
                name={room.name}
                avatarUrl={null}
                roomUrl={`/room/${room.getCanonicalAlias() || room.roomId}`}
                participants={participants}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

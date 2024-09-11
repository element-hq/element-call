/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { Link } from "react-router-dom";
import { MatrixClient } from "matrix-js-sdk/src/client";
import { RoomMember } from "matrix-js-sdk/src/models/room-member";
import { Room } from "matrix-js-sdk/src/models/room";
import { FC } from "react";
import { Text } from "@vector-im/compound-web";

import { Avatar, Size } from "../Avatar";
import styles from "./CallList.module.css";
import { getRelativeRoomUrl } from "../utils/matrix";
import { GroupCallRoom } from "./useGroupCallRooms";
import { useRoomEncryptionSystem } from "../e2ee/sharedKeyManagement";

interface CallListProps {
  rooms: GroupCallRoom[];
  client: MatrixClient;
}

export const CallList: FC<CallListProps> = ({ rooms, client }) => {
  return (
    <>
      <div className={styles.callList}>
        {rooms.map(({ room, roomName, avatarUrl, participants }) => (
          <CallTile
            key={room.roomId}
            client={client}
            name={roomName}
            avatarUrl={avatarUrl}
            room={room}
            participants={participants}
          />
        ))}
        {rooms.length > 3 && (
          <>
            <div className={styles.callTileSpacer} />
            <div className={styles.callTileSpacer} />
          </>
        )}
      </div>
    </>
  );
};
interface CallTileProps {
  name: string;
  avatarUrl: string;
  room: Room;
  participants: RoomMember[];
  client: MatrixClient;
}

const CallTile: FC<CallTileProps> = ({ name, avatarUrl, room }) => {
  const roomEncryptionSystem = useRoomEncryptionSystem(room.roomId);
  return (
    <div className={styles.callTile}>
      <Link
        to={getRelativeRoomUrl(room.roomId, roomEncryptionSystem, room.name)}
        className={styles.callTileLink}
      >
        <Avatar id={room.roomId} name={name} size={Size.LG} src={avatarUrl} />
        <div className={styles.callInfo}>
          <Text weight="semibold" className={styles.callName}>
            {name}
          </Text>
        </div>
        <div className={styles.copyButtonSpacer} />
      </Link>
    </div>
  );
};

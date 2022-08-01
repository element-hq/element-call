/*
Copyright 2022 Matrix.org Foundation C.I.C.

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

import React from "react";
import { Link } from "react-router-dom";
import { MatrixClient, RoomMember } from "matrix-js-sdk";

import { CopyButton } from "../button";
import { Facepile } from "../Facepile";
import { Avatar, Size } from "../Avatar";
import styles from "./CallList.module.css";
import { getRoomUrl } from "../matrix-utils";
import { Body, Caption } from "../typography/Typography";
import { GroupCallRoom } from "./useGroupCallRooms";

interface CallListProps {
  rooms: GroupCallRoom[];
  client: MatrixClient;
  disableFacepile?: boolean;
}
export function CallList({ rooms, client, disableFacepile }: CallListProps) {
  return (
    <>
      <div className={styles.callList}>
        {rooms.map(({ roomId, roomName, avatarUrl, participants }) => (
          <CallTile
            key={roomId}
            client={client}
            name={roomName}
            avatarUrl={avatarUrl}
            roomId={roomId}
            participants={participants}
            disableFacepile={disableFacepile}
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
}
interface CallTileProps {
  name: string;
  avatarUrl: string;
  roomId: string;
  participants: RoomMember[];
  client: MatrixClient;
  disableFacepile?: boolean;
}
function CallTile({
  name,
  avatarUrl,
  roomId,
  participants,
  client,
  disableFacepile,
}: CallTileProps) {
  return (
    <div className={styles.callTile}>
      <Link to={`/room/${roomId}`} className={styles.callTileLink}>
        <Avatar
          size={Size.LG}
          bgKey={name}
          src={avatarUrl}
          fallback={name.slice(0, 1).toUpperCase()}
          className={styles.avatar}
        />
        <div className={styles.callInfo}>
          <Body overflowEllipsis fontWeight="semiBold">
            {name}
          </Body>
          <Caption overflowEllipsis>{getRoomUrl(roomId)}</Caption>
          {participants && !disableFacepile && (
            <Facepile
              className={styles.facePile}
              client={client}
              participants={participants}
            />
          )}
        </div>
        <div className={styles.copyButtonSpacer} />
      </Link>
      <CopyButton
        className={styles.copyButton}
        variant="icon"
        value={getRoomUrl(roomId)}
      />
    </div>
  );
}

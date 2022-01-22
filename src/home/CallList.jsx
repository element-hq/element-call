import React from "react";
import { Link } from "react-router-dom";
import { CopyButton } from "../button";
import { Facepile } from "../Facepile";
import { Avatar } from "../Avatar";
import { ReactComponent as VideoIcon } from "../icons/Video.svg";
import styles from "./CallList.module.css";
import { getRoomUrl } from "../matrix-utils";
import { Body, Caption } from "../typography/Typography";

export function CallList({ rooms, client, disableFacepile }) {
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

function CallTile({
  name,
  avatarUrl,
  roomId,
  participants,
  client,
  disableFacepile,
}) {
  return (
    <div className={styles.callTile}>
      <Link to={`/room/${roomId}`} className={styles.callTileLink}>
        <Avatar
          size="lg"
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

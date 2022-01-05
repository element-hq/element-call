import React from "react";
import { Link } from "react-router-dom";
import { CopyButton } from "../button";
import { Facepile } from "../Facepile";
import { Avatar } from "../Avatar";
import { ReactComponent as VideoIcon } from "../icons/Video.svg";
import styles from "./CallList.module.css";
import { getRoomUrl } from "../ConferenceCallManagerHooks";
import { Body, Caption } from "../typography/Typography";

export function CallList({ rooms, client }) {
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
          />
        ))}
        <div className={styles.callTileSpacer} />
        <div className={styles.callTileSpacer} />
      </div>
    </>
  );
}

function CallTile({ name, avatarUrl, roomId, participants, client }) {
  return (
    <div className={styles.callTile}>
      <Link to={`/room/${roomId}`} className={styles.callTileLink}>
        <Avatar
          size="lg"
          bgKey={name}
          src={avatarUrl}
          fallback={<VideoIcon width={16} height={16} />}
          className={styles.avatar}
        />
        <div className={styles.callInfo}>
          <Body overflowEllipsis fontWeight="semiBold">
            {name}
          </Body>
          <Caption overflowEllipsis>{getRoomUrl(roomId)}</Caption>
          {participants && (
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

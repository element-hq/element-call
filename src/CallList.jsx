import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { CopyButton } from "./button";
import { Facepile } from "./Facepile";
import { Avatar } from "./Avatar";
import { ReactComponent as VideoIcon } from "./icons/Video.svg";
import styles from "./CallList.module.css";
import { getRoomUrl } from "./ConferenceCallManagerHooks";

export function CallList({ title, rooms, client }) {
  return (
    <>
      <h3>{title}</h3>
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
      </div>
    </>
  );
}

function CallTile({ name, avatarUrl, roomId, participants, client }) {
  return (
    <div className={styles.callTile}>
      <Link to={`/room/${roomId}`} className={styles.callTileLink}>
        <Avatar
          size="md"
          bgKey={name}
          src={avatarUrl}
          fallback={<VideoIcon width={16} height={16} />}
          className={styles.avatar}
        />
        <div className={styles.callInfo}>
          <h5>{name}</h5>
          <p>{getRoomUrl(roomId)}</p>
          {participants && (
            <Facepile client={client} participants={participants} />
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

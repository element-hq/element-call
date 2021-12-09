import React from "react";
import { Link } from "react-router-dom";
import { CopyButton } from "./button";
import { Facepile } from "./Facepile";
import { Avatar } from "./Avatar";
import { ReactComponent as VideoIcon } from "./icons/Video.svg";
import styles from "./CallList.module.css";

export function CallList({ title, rooms }) {
  return (
    <>
      <h3>{title}</h3>
      <div className={styles.callList}>
        {rooms.map(({ roomId, roomName, roomUrl, avatarUrl, participants }) => (
          <CallTile
            key={roomId}
            name={roomName}
            avatarUrl={avatarUrl}
            roomUrl={roomUrl}
            participants={participants}
          />
        ))}
      </div>
    </>
  );
}

function CallTile({ name, avatarUrl, roomUrl, participants }) {
  return (
    <Link to={roomUrl} className={styles.callTile}>
      <Avatar
        size="md"
        bgKey={name}
        src={avatarUrl}
        fallback={<VideoIcon width={16} height={16} />}
        className={styles.avatar}
      />
      <div className={styles.callInfo}>
        <h5>{name}</h5>
        <p>{roomUrl}</p>
        {participants && <Facepile participants={participants} />}
      </div>
      <CopyButton
        className={styles.copyButton}
        variant="icon"
        value={roomUrl}
      />
    </Link>
  );
}

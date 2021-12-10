import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { CopyButton } from "./button";
import { Facepile } from "./Facepile";
import { Avatar } from "./Avatar";
import { ReactComponent as VideoIcon } from "./icons/Video.svg";
import styles from "./CallList.module.css";
import { getRoomUrl } from "./ConferenceCallManagerHooks";

export function CallList({ title, rooms }) {
  return (
    <>
      <h3>{title}</h3>
      <div className={styles.callList}>
        {rooms.map(({ roomId, roomName, avatarUrl, participants }) => (
          <CallTile
            key={roomId}
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

function CallTile({ name, avatarUrl, roomId, participants }) {
  return (
    <Link to={`/room/${roomId}`} className={styles.callTile}>
      <Avatar
        size="md"
        bgKey={name}
        src={avatarUrl}
        fallback={<VideoIcon width={16} height={16} />}
        className={styles.avatar}
      />
      <div className={styles.callInfo}>
        <h5>{name}</h5>
        <p>{roomId}</p>
        {participants && <Facepile participants={participants} />}
      </div>
      <CopyButton
        className={styles.copyButton}
        variant="icon"
        value={getRoomUrl(roomId)}
      />
    </Link>
  );
}

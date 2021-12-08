import React from "react";
import { Link } from "react-router-dom";
import { CopyButton } from "./button";
import { Facepile } from "./Facepile";
import { Avatar } from "./Avatar";
import { ReactComponent as VideoIcon } from "./icons/Video.svg";
import styles from "./CallTile.module.css";

export function CallTile({ name, avatarUrl, roomUrl, participants }) {
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

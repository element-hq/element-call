import classNames from "classnames";
import React from "react";
import styles from "./PTTButton.module.css";
import { ReactComponent as MicIcon } from "../icons/Mic.svg";
import { Avatar } from "../Avatar";

export function PTTButton({ client, activeSpeaker }) {
  const size = 232;

  const isLocal = client.userId === activeSpeaker;
  const avatarUrl = activeSpeaker?.user?.avatarUrl;

  return (
    <button
      className={classNames(styles.pttButton, {
        [styles.speaking]: !!activeSpeaker,
      })}
    >
      {isLocal || !avatarUrl || !activeSpeaker ? (
        <MicIcon
          classNames={styles.micIcon}
          width={size / 3}
          height={size / 3}
        />
      ) : (
        <Avatar
          key={activeSpeaker.userId}
          style={{
            width: size,
            height: size,
            borderRadius: size,
            fontSize: Math.round(size / 2),
          }}
          src={
            activeSpeaker.user.avatarUrl &&
            getAvatarUrl(client, activeSpeaker.user.avatarUrl, size)
          }
          fallback={activeSpeaker.name.slice(0, 1).toUpperCase()}
          className={styles.avatar}
        />
      )}
    </button>
  );
}

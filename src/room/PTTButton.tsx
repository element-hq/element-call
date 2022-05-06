import React from "react";
import classNames from "classnames";

import styles from "./PTTButton.module.css";
import { ReactComponent as MicIcon } from "../icons/Mic.svg";
import { Avatar } from "../Avatar";

interface Props {
  showTalkOverError: boolean;
  activeSpeakerUserId: string;
  activeSpeakerDisplayName: string;
  activeSpeakerAvatarUrl: string;
  activeSpeakerIsLocalUser: boolean;
  size: number;
  startTalking: () => void;
  stopTalking: () => void;
}

export const PTTButton: React.FC<Props> = ({
  showTalkOverError,
  activeSpeakerUserId,
  activeSpeakerDisplayName,
  activeSpeakerAvatarUrl,
  activeSpeakerIsLocalUser,
  size,
  startTalking,
  stopTalking,
}) => {
  return (
    <button
      className={classNames(styles.pttButton, {
        [styles.talking]: activeSpeakerUserId,
        [styles.error]: showTalkOverError,
      })}
      onMouseDown={startTalking}
      onMouseUp={stopTalking}
    >
      {activeSpeakerIsLocalUser || !activeSpeakerUserId ? (
        <MicIcon
          className={styles.micIcon}
          width={size / 3}
          height={size / 3}
        />
      ) : (
        <Avatar
          key={activeSpeakerUserId}
          style={{
            width: size - 12,
            height: size - 12,
            borderRadius: size - 12,
            fontSize: Math.round((size - 12) / 2),
          }}
          src={activeSpeakerAvatarUrl}
          fallback={activeSpeakerDisplayName.slice(0, 1).toUpperCase()}
          className={styles.avatar}
        />
      )}
    </button>
  );
};

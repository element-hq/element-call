import React, { useCallback, useEffect, useState } from "react";
import classNames from "classnames";
import styles from "./PTTButton.module.css";
import { ReactComponent as MicIcon } from "../icons/Mic.svg";
import { Avatar } from "../Avatar";

export function PTTButton({
  showTalkOverError,
  activeSpeakerUserId,
  activeSpeakerDisplayName,
  activeSpeakerAvatarUrl,
  activeSpeakerIsLocalUser,
  size,
  startTalking,
  stopTalking,
}) {
  const [isHeld, setHeld] = useState(false);
  const onDocumentMouseUp = useCallback(() => {
    if (isHeld) stopTalking();
    setHeld(false);
  }, [isHeld, setHeld]);

  const onButtonMouseDown = useCallback(() => {
    setHeld(true);
    startTalking();
  }, [setHeld]);

  useEffect(() => {
    window.addEventListener("mouseup", onDocumentMouseUp);

    return () => {
      window.removeEventListener("mouseup", onDocumentMouseUp);
    };
  }, [onDocumentMouseUp]);

  return (
    <button
      className={classNames(styles.pttButton, {
        [styles.talking]: activeSpeakerUserId,
        [styles.error]: showTalkOverError,
      })}
      onMouseDown={onButtonMouseDown}
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
}

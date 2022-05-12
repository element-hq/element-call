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

import React, { useCallback, useEffect, useState } from "react";
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
  const [isHeld, setHeld] = useState(false);
  const onWindowMouseUp = useCallback(
    (e) => {
      if (isHeld) stopTalking();
      setHeld(false);
    },
    [isHeld, setHeld, stopTalking]
  );

  const onWindowTouchEnd = useCallback(
    (e: TouchEvent) => {
      e.preventDefault();
      if (isHeld) stopTalking();
      setHeld(false);
    },
    [isHeld, setHeld, stopTalking]
  );

  const onButtonMouseDown = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setHeld(true);
      startTalking();
    },
    [setHeld, startTalking]
  );

  const onButtonTouchStart = useCallback(
    (e: React.TouchEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setHeld(true);
      startTalking();
    },
    [setHeld, startTalking]
  );

  useEffect(() => {
    window.addEventListener("mouseup", onWindowMouseUp);
    window.addEventListener("touchend", onWindowTouchEnd);

    return () => {
      window.removeEventListener("mouseup", onWindowMouseUp);
      window.removeEventListener("touchend", onWindowTouchEnd);
    };
  }, [onWindowMouseUp, onWindowTouchEnd]);
  return (
    <button
      className={classNames(styles.pttButton, {
        [styles.talking]: activeSpeakerUserId,
        [styles.error]: showTalkOverError,
      })}
      onMouseDown={onButtonMouseDown}
      onTouchStart={onButtonTouchStart}
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

/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { useEffect, useRef, type FC, type ReactNode } from "react";
import useMeasure from "react-use-measure";
import { facingModeFromLocalTrack, type LocalVideoTrack } from "livekit-client";
import classNames from "classnames";

import { Avatar } from "../Avatar";
import styles from "./VideoPreview.module.css";
import { type MuteStates } from "./MuteStates";
import { type EncryptionSystem } from "../e2ee/sharedKeyManagement";

export type MatrixInfo = {
  userId: string;
  displayName: string;
  avatarUrl: string;
  roomId: string;
  roomName: string;
  roomAlias: string | null;
  roomAvatar: string | null;
  e2eeSystem: EncryptionSystem;
};

interface Props {
  matrixInfo: MatrixInfo;
  muteStates: MuteStates;
  videoTrack: LocalVideoTrack | null;
  children: ReactNode;
}

export const VideoPreview: FC<Props> = ({
  matrixInfo,
  muteStates,
  videoTrack,
  children,
}) => {
  const [previewRef, previewBounds] = useMeasure();

  const videoEl = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    // Effect to connect the videoTrack with the video element.
    if (videoEl.current) {
      videoTrack?.attach(videoEl.current);
    }
    return (): void => {
      videoTrack?.detach();
    };
  }, [videoTrack]);

  return (
    <div className={classNames(styles.preview)} ref={previewRef}>
      <video
        className={
          videoTrack &&
          facingModeFromLocalTrack(videoTrack).facingMode === "user"
            ? styles.mirror
            : undefined
        }
        ref={videoEl}
        muted
        playsInline
        // There's no reason for this to be focusable
        tabIndex={-1}
        disablePictureInPicture
      />
      {!muteStates.video.enabled && (
        <div className={styles.avatarContainer}>
          <Avatar
            id={matrixInfo.userId}
            name={matrixInfo.displayName}
            size={Math.min(previewBounds.width, previewBounds.height) / 2}
            src={matrixInfo.avatarUrl}
          />
        </div>
      )}
      <div className={styles.buttonBar}>{children}</div>
    </div>
  );
};

/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useMemo, type FC, type ReactNode } from "react";
import useMeasure from "react-use-measure";
import { type LocalVideoTrack } from "livekit-client";
import classNames from "classnames";
import { useTranslation } from "react-i18next";

import { TileAvatar } from "../tile/TileAvatar";
import styles from "./VideoPreview.module.css";
import { type EncryptionSystem } from "../e2ee/sharedKeyManagement";
import videoPlaceholder from "../graphics/video-placeholder.gif";
import { useAttachedTrack } from "../useAttachedTrack";

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
  videoEnabled: boolean;
  videoTrack: LocalVideoTrack | null;
  children: ReactNode;
}

export const VideoPreview: FC<Props> = ({
  matrixInfo,
  videoEnabled,
  videoTrack,
  children,
}) => {
  const { t } = useTranslation();
  const [previewRef, previewBounds] = useMeasure();

  const { videoRef, mirrored } = useAttachedTrack(videoTrack);

  const cameraIsStarting = useMemo(
    () => videoEnabled && !videoTrack,
    [videoEnabled, videoTrack],
  );

  return (
    <div className={classNames(styles.preview)} ref={previewRef}>
      <video
        className={mirrored ? styles.mirror : undefined}
        ref={videoRef}
        muted
        playsInline
        // There's no reason for this to be focusable
        tabIndex={-1}
        disablePictureInPicture
        // Set the placeholder to a small transparent image. (On Android web
        // views the default poster image is particularly ugly.)
        poster={videoPlaceholder}
      />
      {(!videoEnabled || cameraIsStarting) && (
        <>
          <div className={styles.avatarContainer}>
            {cameraIsStarting && (
              <div className={styles.cameraStarting} role="status">
                {t("video_tile.camera_starting")}
              </div>
            )}
            <TileAvatar
              id={matrixInfo.userId}
              name={matrixInfo.displayName}
              size={Math.min(previewBounds.width, previewBounds.height) / 2}
              src={matrixInfo.avatarUrl}
              loading={cameraIsStarting}
            />
          </div>
        </>
      )}
      <div className={styles.buttonBar}>{children}</div>
    </div>
  );
};

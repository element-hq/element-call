/*
Copyright 2022 - 2024 New Vector Ltd

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

import { useEffect, useMemo, useRef, FC, ReactNode, useCallback } from "react";
import useMeasure from "react-use-measure";
import { ResizeObserver } from "@juggle/resize-observer";
import { usePreviewTracks } from "@livekit/components-react";
import { LocalVideoTrack, Track } from "livekit-client";
import classNames from "classnames";
import { logger } from "matrix-js-sdk/src/logger";

import { Avatar } from "../Avatar";
import styles from "./VideoPreview.module.css";
import { useMediaDevices } from "../livekit/MediaDevicesContext";
import { MuteStates } from "./MuteStates";
import { useInitial } from "../useInitial";
import { EncryptionSystem } from "../e2ee/sharedKeyManagement";

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
  children: ReactNode;
}

export const VideoPreview: FC<Props> = ({
  matrixInfo,
  muteStates,
  children,
}) => {
  const [previewRef, previewBounds] = useMeasure({ polyfill: ResizeObserver });

  const devices = useMediaDevices();

  // Capture the audio options as they were when we first mounted, because
  // we're not doing anything with the audio anyway so we don't need to
  // re-open the devices when they change (see below).
  const initialAudioOptions = useInitial(
    () =>
      muteStates.audio.enabled && { deviceId: devices.audioInput.selectedId },
  );

  const localTrackOptions = useMemo(
    () => ({
      // The only reason we request audio here is to get the audio permission
      // request over with at the same time. But changing the audio settings
      // shouldn't cause this hook to recreate the track, which is why we
      // reference the initial values here.
      // We also pass in a clone because livekit mutates the object passed in,
      // which would cause the devices to be re-opened on the next render.
      audio: Object.assign({}, initialAudioOptions),
      video: muteStates.video.enabled && {
        deviceId: devices.videoInput.selectedId,
      },
    }),
    [
      initialAudioOptions,
      devices.videoInput.selectedId,
      muteStates.video.enabled,
    ],
  );

  const onError = useCallback(
    (error: Error) => {
      logger.error("Error while creating preview Tracks:", error);
      muteStates.audio.setEnabled?.(false);
      muteStates.video.setEnabled?.(false);
    },
    [muteStates.audio, muteStates.video],
  );

  const tracks = usePreviewTracks(localTrackOptions, onError);

  const videoTrack = useMemo(
    () =>
      tracks?.find((t) => t.kind === Track.Kind.Video) as
        | LocalVideoTrack
        | undefined,
    [tracks],
  );

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

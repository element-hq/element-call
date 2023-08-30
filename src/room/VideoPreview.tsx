/*
Copyright 2022 - 2023 New Vector Ltd

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

import { useEffect, useCallback, useMemo, useRef, FC } from "react";
import useMeasure from "react-use-measure";
import { ResizeObserver } from "@juggle/resize-observer";
import { OverlayTriggerState } from "@react-stately/overlays";
import { usePreviewTracks } from "@livekit/components-react";
import {
  CreateLocalTracksOptions,
  LocalVideoTrack,
  Track,
} from "livekit-client";

import { MicButton, SettingsButton, VideoButton } from "../button";
import { Avatar } from "../Avatar";
import styles from "./VideoPreview.module.css";
import { useModalTriggerState } from "../Modal";
import { SettingsModal } from "../settings/SettingsModal";
import { useClient } from "../ClientContext";
import { useMediaDevices } from "../livekit/MediaDevicesContext";
import { MuteStates } from "./MuteStates";

export type MatrixInfo = {
  displayName: string;
  avatarUrl: string;
  roomId: string;
  roomName: string;
  roomAlias: string | null;
};

interface Props {
  matrixInfo: MatrixInfo;
  muteStates: MuteStates;
}

export const VideoPreview: FC<Props> = ({ matrixInfo, muteStates }) => {
  const { client } = useClient();
  const [previewRef, previewBounds] = useMeasure({ polyfill: ResizeObserver });

  const {
    modalState: settingsModalState,
    modalProps: settingsModalProps,
  }: {
    modalState: OverlayTriggerState;
    modalProps: {
      isOpen: boolean;
      onClose: () => void;
    };
  } = useModalTriggerState();

  const openSettings = useCallback(() => {
    settingsModalState.open();
  }, [settingsModalState]);

  const devices = useMediaDevices();

  const initialAudioOptions = useRef<CreateLocalTracksOptions["audio"]>();
  initialAudioOptions.current ??= muteStates.audio.enabled && {
    deviceId: devices.audioInput.selectedId,
  };

  const tracks = usePreviewTracks(
    {
      // The only reason we request audio here is to get the audio permission
      // request over with at the same time. But changing the audio settings
      // shouldn't cause this hook to recreate the track, which is why we
      // reference the initial values here.
      audio: initialAudioOptions.current,
      video: muteStates.video.enabled && {
        deviceId: devices.videoInput.selectedId,
      },
    },
    (error) => {
      console.error("Error while creating preview Tracks:", error);
    }
  );
  const videoTrack = useMemo(
    () =>
      tracks?.find((t) => t.kind === Track.Kind.Video) as
        | LocalVideoTrack
        | undefined,
    [tracks]
  );

  const videoEl = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    // Effect to connect the videoTrack with the video element.
    if (videoEl.current) {
      videoTrack?.attach(videoEl.current);
    }
    return () => {
      videoTrack?.detach();
    };
  }, [videoTrack]);

  const onAudioPress = useCallback(
    () => muteStates.audio.setEnabled?.((e) => !e),
    [muteStates]
  );
  const onVideoPress = useCallback(
    () => muteStates.video.setEnabled?.((e) => !e),
    [muteStates]
  );

  return (
    <div className={styles.preview} ref={previewRef}>
      <video
        data-testid="preview_video"
        ref={videoEl}
        muted
        playsInline
        disablePictureInPicture
      />
      <>
        {!muteStates.video.enabled && (
          <div className={styles.avatarContainer}>
            <Avatar
              size={(previewBounds.height - 66) / 2}
              src={matrixInfo.avatarUrl}
              fallback={matrixInfo.displayName.slice(0, 1).toUpperCase()}
            />
          </div>
        )}
        <div className={styles.previewButtons}>
          <MicButton
            muted={!muteStates.audio.enabled}
            onPress={onAudioPress}
            disabled={muteStates.audio.setEnabled === null}
            data-testid="preview_mute"
          />
          <VideoButton
            muted={!muteStates.video.enabled}
            onPress={onVideoPress}
            disabled={muteStates.video.setEnabled === null}
            data-testid="preview_videomute"
          />
          <SettingsButton onPress={openSettings} />
        </div>
      </>
      {settingsModalState.isOpen && client && (
        <SettingsModal client={client} {...settingsModalProps} />
      )}
    </div>
  );
};

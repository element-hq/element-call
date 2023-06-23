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

import React, { useCallback } from "react";
import useMeasure from "react-use-measure";
import { ResizeObserver } from "@juggle/resize-observer";
import { OverlayTriggerState } from "@react-stately/overlays";
import { usePreviewDevice } from "@livekit/components-react";

import { MicButton, SettingsButton, VideoButton } from "../button";
import { Avatar } from "../Avatar";
import styles from "./VideoPreview.module.css";
import { useModalTriggerState } from "../Modal";
import { SettingsModal } from "../settings/SettingsModal";
import { useClient } from "../ClientContext";
import { useMediaDevices } from "../livekit/useMediaDevices";
import { DeviceChoices, UserChoices } from "../livekit/useLiveKit";
import { useDefaultDevices } from "../settings/useSetting";

export type MatrixInfo = {
  userName: string;
  avatarUrl: string;
  roomName: string;
  roomIdOrAlias: string;
  roomAvatarUrl: string | null;
};

interface Props {
  matrixInfo: MatrixInfo;
  onUserChoicesChanged: (choices: UserChoices) => void;
}

export function VideoPreview({ matrixInfo, onUserChoicesChanged }: Props) {
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

  // Fetch user media devices.
  const mediaDevices = useMediaDevices();

  // Create local media tracks.
  const [videoEnabled, setVideoEnabled] = React.useState<boolean>(true);
  const [audioEnabled, setAudioEnabled] = React.useState<boolean>(true);
  const [videoId, audioId] = [
    mediaDevices.videoIn.selectedId,
    mediaDevices.audioIn.selectedId,
  ];
  const [defaultDevices] = useDefaultDevices();
  const video = usePreviewDevice(
    videoEnabled,
    videoId != "" ? videoId : defaultDevices.videoinput,
    "videoinput"
  );
  const audio = usePreviewDevice(
    audioEnabled,
    audioId != "" ? audioId : defaultDevices.audioinput,
    "audioinput"
  );

  const activeVideoId = video?.selectedDevice?.deviceId;
  const activeAudioId = audio?.selectedDevice?.deviceId;
  React.useEffect(() => {
    const createChoices = (
      enabled: boolean,
      deviceId?: string
    ): DeviceChoices | undefined => {
      if (deviceId === undefined) {
        return undefined;
      }

      return {
        selectedId: deviceId,
        enabled,
      };
    };

    onUserChoicesChanged({
      video: createChoices(videoEnabled, activeVideoId),
      audio: createChoices(audioEnabled, activeAudioId),
    });
  }, [
    onUserChoicesChanged,
    activeVideoId,
    videoEnabled,
    activeAudioId,
    audioEnabled,
  ]);

  const [selectVideo, selectAudio] = [
    mediaDevices.videoIn.setSelected,
    mediaDevices.audioIn.setSelected,
  ];
  React.useEffect(() => {
    if (activeVideoId && activeVideoId !== "") {
      selectVideo(activeVideoId);
    }
    if (activeAudioId && activeAudioId !== "") {
      selectAudio(activeAudioId);
    }
  }, [selectVideo, selectAudio, activeVideoId, activeAudioId]);

  const mediaElement = React.useRef(null);
  React.useEffect(() => {
    if (mediaElement.current) {
      video?.localTrack?.attach(mediaElement.current);
    }
    return () => {
      video?.localTrack?.detach();
    };
  }, [video?.localTrack, mediaElement]);

  return (
    <div className={styles.preview} ref={previewRef}>
      <video ref={mediaElement} muted playsInline disablePictureInPicture />
      <>
        {(video ? !videoEnabled : true) && (
          <div className={styles.avatarContainer}>
            <Avatar
              size={(previewBounds.height - 66) / 2}
              src={matrixInfo.avatarUrl}
              fallback={matrixInfo.userName.slice(0, 1).toUpperCase()}
            />
          </div>
        )}
        <div className={styles.previewButtons}>
          {audio.localTrack && (
            <MicButton
              muted={!audioEnabled}
              onPress={() => setAudioEnabled(!audioEnabled)}
            />
          )}
          {video.localTrack && (
            <VideoButton
              muted={!videoEnabled}
              onPress={() => setVideoEnabled(!videoEnabled)}
            />
          )}
          <SettingsButton onPress={openSettings} />
        </div>
      </>
      {settingsModalState.isOpen && (
        <SettingsModal
          client={client}
          mediaDevices={mediaDevices}
          {...settingsModalProps}
        />
      )}
    </div>
  );
}

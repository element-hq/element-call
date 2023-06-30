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
import { useMediaAllDevicesWithLocalStorage } from "../livekit/useMediaAllDevicesWithLocalStorage";
import { DeviceChoices, UserChoices } from "../livekit/useLiveKit";

export type MatrixInfo = {
  userName: string;
  avatarUrl: string;
  roomName: string;
  roomIdOrAlias: string;
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
  const mediaDevices = useMediaAllDevicesWithLocalStorage();
  const { permittedDevices, videoIn, audioIn } = mediaDevices;
  // Create local media tracks.
  const [videoEnabled, setVideoEnabled] = React.useState<boolean>(true);
  const [audioEnabled, setAudioEnabled] = React.useState<boolean>(true);

  const permissionsAvailable =
    !!permittedDevices.audioDeviceId &&
    !!permittedDevices.videoDeviceId &&
    videoIn.selectedId != "" &&
    audioIn.selectedId != "";
  // Use preview device only creates tracks if permissions are available.
  // useMediaAllDevicesWithLocalStorage will respect the user selection
  // and audioIn/videoIn.selectedId will be updated to reflect what the user has selected in the permission dialog.
  // => useMediaAllDevicesWithLocalStorage abstracts all user selection logic and is what we actually want to use inside the call/preview
  const video = usePreviewDevice(
    videoEnabled,
    videoIn.selectedId,
    "videoinput",
    permissionsAvailable
  );
  const audio = usePreviewDevice(
    audioEnabled,
    audioIn.selectedId,
    "audioinput",
    permissionsAvailable
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

  React.useEffect(() => {
    // update the input in this hook ONLY for the case where usePreviewDevice (videoIn.selectedId != activeVideoId)
    // changes the device (the user giving permission to a different device than what was requested).
    // The hook needs to only update on activeVideoId/activeAudioId to not end up in a loop
    if (
      activeVideoId &&
      activeVideoId !== "" &&
      videoIn.selectedId != activeVideoId
    ) {
      videoIn.setSelected(activeVideoId);
    }
    if (
      activeAudioId &&
      activeAudioId !== "" &&
      audioIn.selectedId != activeAudioId
    ) {
      audioIn.setSelected(activeAudioId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVideoId, activeAudioId]);

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

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

import React, { useState, useEffect, useCallback, useRef } from "react";
import useMeasure from "react-use-measure";
import { ResizeObserver } from "@juggle/resize-observer";
import { OverlayTriggerState } from "@react-stately/overlays";
import { usePreviewTracks } from "@livekit/components-react";
import { LocalAudioTrack, LocalVideoTrack, Track } from "livekit-client";

import { MicButton, SettingsButton, VideoButton } from "../button";
import { Avatar } from "../Avatar";
import styles from "./VideoPreview.module.css";
import { useModalTriggerState } from "../Modal";
import { SettingsModal } from "../settings/SettingsModal";
import { useClient } from "../ClientContext";
import { useMediaDevicesSwitcher } from "../livekit/useMediaDevicesSwitcher";
import { UserChoices } from "../livekit/useLiveKit";
import { useDefaultDevices } from "../settings/useSetting";

export type MatrixInfo = {
  displayName: string;
  avatarUrl: string;
  roomId: string;
  roomName: string;
  roomAlias: string | null;
};

interface Props {
  matrixInfo: MatrixInfo;
  initWithMutedAudio: boolean;
  onUserChoicesChanged: (choices: UserChoices) => void;
}

export function VideoPreview({
  matrixInfo,
  initWithMutedAudio,
  onUserChoicesChanged,
}: Props) {
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

  // Create local media tracks.
  const [videoEnabled, setVideoEnabled] = useState<boolean>(true);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(
    !initWithMutedAudio
  );

  // The settings are updated as soon as the device changes. We wrap the settings value in a ref to store their initial value.
  // Not changing the device options prohibits the usePreviewTracks hook to recreate the tracks.
  const initialDefaultDevices = useRef(useDefaultDevices()[0]);
  const tracks = usePreviewTracks(
    {
      audio: { deviceId: initialDefaultDevices.current.audioinput },
      video: { deviceId: initialDefaultDevices.current.videoinput },
    },
    (error) => {
      console.error("Error while creating preview Tracks:", error);
    }
  );
  const videoTrack = React.useMemo(
    () =>
      tracks?.filter((t) => t.kind === Track.Kind.Video)[0] as LocalVideoTrack,
    [tracks]
  );
  const audioTrack = React.useMemo(
    () =>
      tracks?.filter((t) => t.kind === Track.Kind.Audio)[0] as LocalAudioTrack,
    [tracks]
  );

  // Only let the MediaDeviceSwitcher request permissions if a video track is already available.
  // Otherwise we would end up asking for permissions in usePreviewTracks and in useMediaDevicesSwitcher.
  const requestPermissions = !!audioTrack && !!videoTrack;
  const mediaSwitcher = useMediaDevicesSwitcher(
    undefined,
    { videoTrack, audioTrack },
    requestPermissions
  );
  const { videoIn, audioIn } = mediaSwitcher;

  const videoEl = React.useRef(null);

  useEffect(() => {
    // Effect to update the settings
    onUserChoicesChanged({
      video: {
        selectedId: videoIn.selectedId,
        enabled: videoEnabled,
      },
      audio: {
        selectedId: audioIn.selectedId,
        enabled: audioEnabled,
      },
    });
  }, [
    onUserChoicesChanged,
    videoIn.selectedId,
    videoEnabled,
    audioIn.selectedId,
    audioEnabled,
    videoTrack,
    audioTrack,
  ]);

  useEffect(() => {
    // Effect to update the initial device selection for the ui elements based on the current preview track.
    if (!videoIn.selectedId || videoIn.selectedId == "") {
      videoTrack?.getDeviceId().then((videoId) => {
        videoIn.setSelected(videoId ?? "default");
      });
    }
    if (!audioIn.selectedId || audioIn.selectedId == "") {
      audioTrack?.getDeviceId().then((audioId) => {
        // getDeviceId() can return undefined for audio devices. This happens if
        // the devices list uses "default" as the device id for the current
        // device and the device set on the track also uses the deviceId
        // "default". Check `normalizeDeviceId` in  `getDeviceId` for more
        // details.
        audioIn.setSelected(audioId ?? "default");
      });
    }
  }, [videoIn, audioIn, videoTrack, audioTrack]);

  useEffect(() => {
    // Effect to connect the videoTrack with the video element.
    if (videoEl.current) {
      videoTrack?.unmute();
      videoTrack?.attach(videoEl.current);
    }
    return () => {
      videoTrack?.detach();
    };
  }, [videoTrack]);

  useEffect(() => {
    // Effect to mute/unmute video track. (This has to be done, so that the hardware camera indicator does not confuse the user)
    if (videoTrack && videoEnabled) {
      videoTrack?.unmute();
    } else if (videoTrack) {
      videoTrack?.mute();
    }
  }, [videoEnabled, videoTrack]);

  return (
    <div className={styles.preview} ref={previewRef}>
      <video ref={videoEl} muted playsInline disablePictureInPicture />
      <>
        {(videoTrack ? !videoEnabled : true) && (
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
            muted={!audioEnabled}
            onPress={() => setAudioEnabled(!audioEnabled)}
            disabled={!audioTrack}
          />
          <VideoButton
            muted={!videoEnabled}
            onPress={() => setVideoEnabled(!videoEnabled)}
            disabled={!videoTrack}
          />
          <SettingsButton onPress={openSettings} />
        </div>
      </>
      {settingsModalState.isOpen && client && (
        <SettingsModal
          client={client}
          mediaDevicesSwitcher={mediaSwitcher}
          {...settingsModalProps}
        />
      )}
    </div>
  );
}
